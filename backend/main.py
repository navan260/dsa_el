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
    def __init__(self, cols=10):
        self.rows = 3  # Fixed layout: Row 0 (Slots), Row 1 (Road), Row 2 (Slots)
        self.cols = cols
        self.graph = nx.Graph()
        
        self.slots = [] # Priority Queue (min-heap of available slot indices)
        self.slot_status = {} # Map slot_idx -> filled (0/1)
        self.vehicle_map: Dict[str, int] = {} # Vehicle ID -> Slot Index
        
        self.idx_to_node = {}
        self.node_to_idx = {}
        
        # Build Graph
        # We need unique IDs for all nodes. 
        # Let's simple use (r * cols + c) for ID generation, ensuring uniqueness.
        
        def get_id(r, c):
            return r * cols + c

        # 1. Create Nodes
        for c in range(cols):
            # Top Slot (Row 0)
            top_id = get_id(0, c)
            self.graph.add_node(top_id, type="slot", r=0, c=c)
            self.idx_to_node[top_id] = (0, c)
            self.node_to_idx[(0, c)] = top_id
            self.slot_status[top_id] = 0
            
            # Road (Row 1)
            road_id = get_id(1, c)
            self.graph.add_node(road_id, type="road", r=1, c=c)
            self.idx_to_node[road_id] = (1, c)
            self.node_to_idx[(1, c)] = road_id
            
            # Bottom Slot (Row 2)
            bot_id = get_id(2, c)
            self.graph.add_node(bot_id, type="slot", r=2, c=c)
            self.idx_to_node[bot_id] = (2, c)
            self.node_to_idx[(2, c)] = bot_id
            self.slot_status[bot_id] = 0

            # 2. Add Edges
            # Connect Road segments (Horizontal)
            if c > 0:
                prev_road = get_id(1, c-1)
                self.graph.add_edge(prev_road, road_id, weight=1)
            
            # Connect Slots to Road (Vertical)
            self.graph.add_edge(road_id, top_id, weight=1)
            self.graph.add_edge(road_id, bot_id, weight=1)

        self.entry_node_id = get_id(1, 0) # Entry is start of road
        
        # Calculate BFS distance from entry to all SLOTS for the PQ
        lengths = dict(nx.single_source_dijkstra_path_length(self.graph, self.entry_node_id))
        
        # Populate Priority Queue with only SLOTS
        for node_id, data in self.graph.nodes(data=True):
            if data['type'] == 'slot':
                dist = lengths[node_id]
                # Priority: Distance, then ID (to keep order stable)
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
