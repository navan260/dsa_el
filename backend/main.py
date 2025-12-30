from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import networkx as nx
import heapq
from pydantic import BaseModel
from typing import List, Tuple, Dict, Any

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ParkingSystem:
    def __init__(self):
        self.graph = nx.Graph()
        self.slots = [] # Priority Queue
        self.slot_status = {}
        self.vehicle_map: Dict[str, int] = {} 
        self.idx_to_node = {}
        self.node_to_idx = {}
        
        # Define Grid Layout
        # S: Slot, R: Road, .: Obstacle/Grass, E: Entry
        # Trying to replicate the image with L-shape and islands
        layout_map = [
            "SSSSSSSSSSSSSSSSSSS",
            "RRRRRRRRRRRRRRRRRRR",
            "SS.R.SSSSSSSSS.R.SS",
            "SS.R.S.......S.R.SS",
            "SS.R.S.RRRRR.S.R.SS",
            "SS.R.S.R...R.S.R.SS",
            "SS.R.S.R...R.S.R.SS",
            "SS.R.S.RRRRR.S.R.SS",
            "SS.R.S.......S.R.SS",
            "SS.R.SSSSSSSSS.R.SS",
            "RR.RRRRRRRRRRRRR.RR",
            "SSSSSSSSSSSSSSSSSSS",
        ]
        
        self.rows = len(layout_map)
        self.cols = len(layout_map[0])
        
        # Helper to get unique ID
        def get_id(r, c):
            return r * self.cols + c

        # 1. Create Nodes
        for r in range(self.rows):
            for c in range(self.cols):
                char = layout_map[r][c]
                if char == '.':
                    continue # Skip empty space
                
                node_id = get_id(r, c)
                node_type = "slot" if char == 'S' else "road"
                
                self.graph.add_node(node_id, type=node_type, r=r, c=c)
                self.idx_to_node[node_id] = (r, c)
                self.node_to_idx[(r, c)] = node_id
                
                if char == 'S':
                    self.slot_status[node_id] = 0
                
                if char == 'E':
                    self.entry_node_id = node_id
                    # Entry is technically a road point too
                    self.graph.nodes[node_id]['type'] = 'road' 

        # 2. Add Edges (Connect neighbors)
        # We only connect Road-Road and Road-Slot.
        # Slots do NOT connect to Slots directly (usually).
        # But for graph simplicity, let's just connect everything relative to the grid
        # And check strict validity: 
        # - Road <-> Road
        # - Road <-> Slot
        # - Slot <-> Slot (ONLY if we allow driving through slots? No, let's avoid)
        
        directions = [(-1,0), (1,0), (0,-1), (0,1)]
        
        for u in self.graph.nodes():
            r1, c1 = self.graph.nodes[u]['r'], self.graph.nodes[u]['c']
            type1 = self.graph.nodes[u]['type']
            
            for dr, dc in directions:
                r2, c2 = r1 + dr, c1 + dc
                if (r2, c2) in self.node_to_idx:
                    v = self.node_to_idx[(r2, c2)]
                    type2 = self.graph.nodes[v]['type']
                    
                    # Logic: 
                    # Drive on Roads.
                    # Enter/Exit Slot from Road.
                    # Don't drive Slot to Slot directly unless necessary? 
                    # Let's allow all connections for now to ensure graph connectivity, 
                    # but weight Road-Road lower to prefer it?
                    
                    weight = 1
                    
                    # Prevent Slot-Slot connections to force using roads?
                    if type1 == 'slot' and type2 == 'slot':
                         continue

                    self.graph.add_edge(u, v, weight=weight)
                    
        # Calculate BFS distance for PQ priority
        if not hasattr(self, 'entry_node_id'):
             # Fallback if no entry
            self.entry_node_id = get_id(1, 1)

        try:
            lengths = dict(nx.single_source_dijkstra_path_length(self.graph, self.entry_node_id))
        except:
             # Graph might be disconnected if map is bad, fallback
            lengths = {n: 999 for n in self.graph.nodes()}

        # Populate Priority Queue
        for node_id, data in self.graph.nodes(data=True):
            if data['type'] == 'slot':
                dist = lengths.get(node_id, 9999)
                heapq.heappush(self.slots, (dist, node_id))

    def get_status(self):
        """Returns the current state for visualization."""
        nodes = []
        edges = []
        
        # Serialize graph
        for (u, v) in self.graph.edges():
            edges.append({"source": u, "target": v})
            
        for node_id, data in self.graph.nodes(data=True):
            vehicle_id = None
            is_filled = False
            
            if data['type'] == 'slot':
                # Check occupancy
                for vid, s_idx in self.vehicle_map.items():
                    if s_idx == node_id:
                        vehicle_id = vid
                        break
                is_filled = bool(self.slot_status.get(node_id, 0))
            
            nodes.append({
                "id": node_id,
                "x": data['c'], # Col
                "y": data['r'], # Row
                "type": data['type'],
                "filled": is_filled,
                "vehicle_id": vehicle_id,
                "is_entry": (node_id == self.entry_node_id)
            })
            
        return {"nodes": nodes, "edges": edges}

    def park_vehicle(self, vehicle_id: str):
        if vehicle_id in self.vehicle_map:
            raise HTTPException(status_code=400, detail="Vehicle already parked")
        
        if not self.slots:
            raise HTTPException(status_code=400, detail="Parking Lot Full")
            
        # Pop nearest slot
        dist, slot_id = heapq.heappop(self.slots)
        
        self.slot_status[slot_id] = 1
        self.vehicle_map[vehicle_id] = slot_id
        
        # Calculate path
        path_nodes = nx.shortest_path(self.graph, self.entry_node_id, slot_id)
        
        return {
            "message": f"Allocated slot {slot_id}",
            "slot_id": slot_id,
            "path": path_nodes
        }

    def remove_vehicle(self, vehicle_id: str):
        if vehicle_id not in self.vehicle_map:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        
        slot_id = self.vehicle_map.pop(vehicle_id)
        self.slot_status[slot_id] = 0
        
        # Add back to PQ
        dist = nx.shortest_path_length(self.graph, self.entry_node_id, slot_id)
        heapq.heappush(self.slots, (dist, slot_id))
        
        return {"message": f"Vehicle {vehicle_id} left slot {slot_id}"}

# Global Instance
parking_system = ParkingSystem()

@app.get("/init")
def init_state():
    return parking_system.get_status()

@app.post("/park/{vehicle_id}")
def park(vehicle_id: str):
    return parking_system.park_vehicle(vehicle_id)

@app.post("/leave/{vehicle_id}")
def leave(vehicle_id: str):
    return parking_system.remove_vehicle(vehicle_id)

@app.get("/status")
def status():
    return parking_system.get_status()
