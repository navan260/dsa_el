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
    def __init__(self, rows=5, cols=5):
        self.rows = rows
        self.cols = cols
        self.graph = nx.grid_2d_graph(rows, cols)
        
        # We define slots as all nodes for simplicity in this demo, 
        # but logically we could separate driveways.
        # Let's say all nodes are slots.
        # Nodes are tuples (r, c).
        # We need a linear ID for the priority queue or use the tuple? 
        # Python's heapq works with tuples (comparison is element-wise).
        # To strictly follow "array represents whether slot is filled", we map (r,c) to linear index.
        
        self.slots = [] # The Priority Queue (stores linear indices)
        self.slot_status = [0] * (rows * cols) # Array: 0=Empty, 1=Filled
        self.vehicle_map: Dict[str, int] = {} # Vehicle ID -> Slot Index
        
        # Initialize PQ with all slots. 
        # Distance metric: simple Manhattan distance from Entry (0,0) is implicit 
        # if we prioritize by proximity. 
        # But a standard Min-Heap on indices 0..N doesn't necessarily mean "nearest".
        # User requirement: "priority queue to indicate nearest empty parking slot".
        # So we should store (distance_from_entry, slot_index) in the PQ.
        
        self.entry_node = (0, 0)
        
        # Precompute distances from entry to all nodes
        self.idx_to_node = {}
        self.node_to_idx = {}
        count = 0
        for r in range(rows):
            for c in range(cols):
                self.idx_to_node[count] = (r, c)
                self.node_to_idx[(r, c)] = count
                count += 1
                
        # Calculate BFS distance from entry to all nodes for the PQ
        lengths = dict(nx.single_source_shortest_path_length(self.graph, self.entry_node))
        
        for idx in range(count):
            node = self.idx_to_node[idx]
            dist = lengths[node]
            # Push (distance, idx) to heap. 
            # If distances are equal, smaller idx (ID) is tie-breaker.
            heapq.heappush(self.slots, (dist, idx))

    def get_status(self):
        """Returns the current state for visualization."""
        nodes = []
        edges = []
        
        # Serialize graph
        for (u, v) in self.graph.edges():
            # u, v are (row, col) tuples
            edges.append({"source": self.node_to_idx[u], "target": self.node_to_idx[v]})
            
        for idx in range(len(self.slot_status)):
            r, c = self.idx_to_node[idx]
            vehicle_id = None
            # Find vehicle in this slot
            for vid, s_idx in self.vehicle_map.items():
                if s_idx == idx:
                    vehicle_id = vid
                    break
            
            nodes.append({
                "id": idx,
                "x": c, # Visual X (column)
                "y": r, # Visual Y (row)
                "filled": bool(self.slot_status[idx]),
                "vehicle_id": vehicle_id,
                "is_entry": (r, c) == self.entry_node
            })
            
        return {"nodes": nodes, "edges": edges}

    def park_vehicle(self, vehicle_id: str):
        if vehicle_id in self.vehicle_map:
            raise HTTPException(status_code=400, detail="Vehicle already parked")
        
        if not self.slots:
            raise HTTPException(status_code=400, detail="Parking Lot Full")
            
        # Pop nearest slot
        dist, slot_idx = heapq.heappop(self.slots)
        
        self.slot_status[slot_idx] = 1
        self.vehicle_map[vehicle_id] = slot_idx
        
        # Calculate path
        target_node = self.idx_to_node[slot_idx]
        path_nodes = nx.shortest_path(self.graph, self.entry_node, target_node)
        path_indices = [self.node_to_idx[n] for n in path_nodes]
        
        return {
            "message": f"Allocated slot {slot_idx}",
            "slot_id": slot_idx,
            "path": path_indices
        }

    def remove_vehicle(self, vehicle_id: str):
        if vehicle_id not in self.vehicle_map:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        
        slot_idx = self.vehicle_map.pop(vehicle_id)
        self.slot_status[slot_idx] = 0
        
        # Add back to PQ
        # We need to look up distance again
        node = self.idx_to_node[slot_idx]
        dist = nx.shortest_path_length(self.graph, self.entry_node, node)
        
        heapq.heappush(self.slots, (dist, slot_idx))
        
        return {"message": f"Vehicle {vehicle_id} left slot {slot_idx}"}

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
