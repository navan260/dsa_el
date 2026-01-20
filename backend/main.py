from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import networkx as nx
import heapq
from pydantic import BaseModel
from typing import List, Tuple, Dict, Any, Optional

class GridConfig(BaseModel):
    """Configuration for parking grid layout."""
    rows_2w_top: int = 1       # Number of 2-wheeler rows at top
    rows_2w_bottom: int = 1    # Number of 2-wheeler rows at bottom  
    rows_4w: int = 8           # Number of 4-wheeler rows (alternating S and R)
    cols: int = 19             # Number of columns for 2-wheeler zones
    cols_4w: int = 10          # Number of 4-wheeler slot columns (each with adjacent road)
    
    def generate_layout(self) -> List[str]:
        """Generate layout map from configuration."""
        layout = []
        
        # Calculate max width (4W zone might be wider due to S-R pairs + left road)
        max_width = max(self.cols + 1, self.cols_4w * 2 + 1)  # +1 for left column
        
        # Top 2-wheeler rows (with empty space on left for label)
        for _ in range(self.rows_2w_top):
            row = "." + "T" * self.cols
            # Pad to max width if needed
            row = row.ljust(max_width, '.')
            layout.append(row)
        
        # Road after 2W zone (entry road) - entry point on left
        if self.rows_2w_top > 0:
            layout.append("E" + "R" * (max_width - 1))
        
        # 4-wheeler zone (alternating S-R pattern, with road on left)
        for i in range(self.rows_4w):
            row = "R"  # Road on left
            for c in range(self.cols_4w):
                row += "SR"  # Each 4W column is a slot + road pair
            # Pad to max width if needed
            row = row.ljust(max_width, '.')
            layout.append(row)
        
        # Road before bottom 2W zone
        if self.rows_2w_bottom > 0:
            layout.append("E" + "R" * (max_width - 1))
        
        # Bottom 2-wheeler rows (with empty space on left for label)
        for _ in range(self.rows_2w_bottom):
            row = "." + "T" * self.cols
            # Pad to max width if needed
            row = row.ljust(max_width, '.')
            layout.append(row)
        
        return layout

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ParkingSystem:
    def __init__(self, layout_map: List[str] = None):
        # Default layout if none provided
        if layout_map is None:
            layout_map = [
                ".TTTTTTTTTTTTTTTTTTT",  # Row 0: 2-Wheeler Zone (Top) - empty on left
                "ERRRRRRRRRRRRRRRRRRRR",  # Row 1: Main Road with Entry on left
                "RSRSRSRSRSRSRSRSRSRSR",  # Rows 2-9: 4-Wheeler Zone with road on left
                "RSRSRSRSRSRSRSRSRSRSR",
                "RSRSRSRSRSRSRSRSRSRSR",
                "RSRSRSRSRSRSRSRSRSRSR",
                "RSRSRSRSRSRSRSRSRSRSR",
                "RSRSRSRSRSRSRSRSRSRSR",
                "RSRSRSRSRSRSRSRSRSRSR",
                "RSRSRSRSRSRSRSRSRSRSR",
                "ERRRRRRRRRRRRRRRRRRRR",  # Row 10: Main Road with Entry on left
                ".TTTTTTTTTTTTTTTTTTT",  # Row 11: 2-Wheeler Zone (Bottom) - empty on left
            ]
        self._build_graph(layout_map)
    
    def _build_graph(self, layout_map: List[str]):
        """Build the parking graph from layout map."""
        self.graph = nx.Graph()
        self.slots_2w = []  # Priority Queue for 2-wheelers
        self.slots_4w = []  # Priority Queue for 4-wheelers
        self.slot_status = {}
        self.slot_category = {}  # Maps slot_id to '2w' or '4w'
        self.vehicle_map: Dict[str, Tuple[int, str]] = {}
        self.idx_to_node = {}
        self.node_to_idx = {}
        self.layout_map = layout_map
        
        self.rows = len(layout_map)
        self.cols = len(layout_map[0]) if layout_map else 0
        
        # Helper to get unique ID
        def get_id(r, c):
            return r * self.cols + c

        # 1. Create Nodes
        for r in range(self.rows):
            for c in range(self.cols):
                char = layout_map[r][c]
                if char == '.':
                    continue  # Skip empty space
                
                node_id = get_id(r, c)
                
                if char == 'T':
                    node_type = "slot"
                    self.slot_category[node_id] = '2w'
                elif char == 'S':
                    node_type = "slot"
                    self.slot_category[node_id] = '4w'
                else:
                    node_type = "road"
                
                self.graph.add_node(node_id, type=node_type, r=r, c=c)
                self.idx_to_node[node_id] = (r, c)
                self.node_to_idx[(r, c)] = node_id
                
                if char in ('T', 'S'):
                    self.slot_status[node_id] = 0
                
                if char == 'E':
                    self.entry_node_id = node_id
                    self.graph.nodes[node_id]['type'] = 'road'

        # 2. Add Edges (Connect neighbors)
        directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        
        for u in self.graph.nodes():
            r1, c1 = self.graph.nodes[u]['r'], self.graph.nodes[u]['c']
            type1 = self.graph.nodes[u]['type']
            
            for dr, dc in directions:
                r2, c2 = r1 + dr, c1 + dc
                if (r2, c2) in self.node_to_idx:
                    v = self.node_to_idx[(r2, c2)]
                    type2 = self.graph.nodes[v]['type']
                    
                    weight = 1
                    
                    # Penalize ANY interaction with a slot
                    if type1 == 'slot' or type2 == 'slot':
                        weight = 50
                    
                    # Extra penalty for driving between slots
                    if type1 == 'slot' and type2 == 'slot':
                        weight = 100

                    self.graph.add_edge(u, v, weight=weight)
                    
        # Calculate BFS distance for PQ priority
        if not hasattr(self, 'entry_node_id'):
            # Default entry point at row 1, col 0
            if (1, 0) in self.node_to_idx:
                self.entry_node_id = self.node_to_idx[(1, 0)]
            else:
                self.entry_node_id = list(self.graph.nodes())[0] if self.graph.nodes() else 0

        try:
            lengths = dict(nx.single_source_dijkstra_path_length(self.graph, self.entry_node_id))
        except:
            lengths = {n: 999 for n in self.graph.nodes()}

        # Populate Priority Queues based on slot category
        for node_id, data in self.graph.nodes(data=True):
            if data['type'] == 'slot':
                dist = lengths.get(node_id, 9999)
                if self.slot_category.get(node_id) == '2w':
                    heapq.heappush(self.slots_2w, (dist, node_id))
                else:
                    heapq.heappush(self.slots_4w, (dist, node_id))
    
    def configure(self, layout_map: List[str]):
        """Reconfigure the parking system with a new layout."""
        self._build_graph(layout_map)
        return {"message": "Parking system reconfigured", "rows": self.rows, "cols": self.cols}

    def get_status(self):
        """Returns the current state for visualization."""
        nodes = []
        edges = []
        
        # Serialize graph
        for (u, v) in self.graph.edges():
            edges.append({"source": u, "target": v})
            
        for node_id, data in self.graph.nodes(data=True):
            vehicle_id = None
            vehicle_type = None
            is_filled = False
            
            if data['type'] == 'slot':
                # Check occupancy
                for vid, (s_idx, v_type) in self.vehicle_map.items():
                    if s_idx == node_id:
                        vehicle_id = vid
                        vehicle_type = v_type
                        break
                is_filled = bool(self.slot_status.get(node_id, 0))
            
            nodes.append({
                "id": node_id,
                "x": data['c'],  # Col
                "y": data['r'],  # Row
                "type": data['type'],
                "filled": is_filled,
                "vehicle_id": vehicle_id,
                "vehicle_type": vehicle_type,
                "slot_category": self.slot_category.get(node_id),
                "is_entry": (node_id == self.entry_node_id)
            })
        
        # Calculate stats
        total_2w = len([n for n in nodes if n.get('slot_category') == '2w'])
        filled_2w = len([n for n in nodes if n.get('slot_category') == '2w' and n.get('filled')])
        total_4w = len([n for n in nodes if n.get('slot_category') == '4w'])
        filled_4w = len([n for n in nodes if n.get('slot_category') == '4w' and n.get('filled')])
            
        return {
            "nodes": nodes, 
            "edges": edges,
            "stats": {
                "2w": {"total": total_2w, "available": total_2w - filled_2w},
                "4w": {"total": total_4w, "available": total_4w - filled_4w}
            }
        }

    def park_vehicle(self, vehicle_id: str, vehicle_type: str = "4w"):
        if vehicle_id in self.vehicle_map:
            raise HTTPException(status_code=400, detail="Vehicle already parked")
        
        # Select correct priority queue based on vehicle type
        if vehicle_type == "2w":
            slots_queue = self.slots_2w
            queue_name = "2-Wheeler"
        else:
            slots_queue = self.slots_4w
            queue_name = "4-Wheeler"
        
        if not slots_queue:
            raise HTTPException(status_code=400, detail=f"{queue_name} Parking Full")
            
        # Pop nearest slot from appropriate queue
        dist, slot_id = heapq.heappop(slots_queue)
        
        self.slot_status[slot_id] = 1
        self.vehicle_map[vehicle_id] = (slot_id, vehicle_type)
        
        # Dynamic weight function that avoids occupied slots
        def dynamic_weight(u, v, data):
            base_weight = data.get('weight', 1)
            # Heavily penalize going through occupied slots (except the destination)
            if u != slot_id and self.slot_status.get(u, 0) == 1:
                return 10000  # Very high penalty for occupied slots
            if v != slot_id and self.slot_status.get(v, 0) == 1:
                return 10000  # Very high penalty for occupied slots
            return base_weight
        
        # Calculate path avoiding occupied slots
        path_nodes = nx.shortest_path(self.graph, self.entry_node_id, slot_id, weight=dynamic_weight)
        
        return {
            "message": f"Allocated {queue_name} slot {slot_id}",
            "slot_id": slot_id,
            "vehicle_type": vehicle_type,
            "path": path_nodes
        }

    def remove_vehicle(self, vehicle_id: str):
        if vehicle_id not in self.vehicle_map:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        
        slot_id, vehicle_type = self.vehicle_map.pop(vehicle_id)
        self.slot_status[slot_id] = 0
        
        # Add back to correct PQ
        dist = nx.shortest_path_length(self.graph, self.entry_node_id, slot_id, weight='weight')
        if vehicle_type == "2w":
            heapq.heappush(self.slots_2w, (dist, slot_id))
        else:
            heapq.heappush(self.slots_4w, (dist, slot_id))
        
        return {"message": f"Vehicle {vehicle_id} left slot {slot_id}"}

# Global Instance
parking_system = ParkingSystem()

@app.get("/init")
def init_state():
    return parking_system.get_status()

@app.post("/park/{vehicle_id}")
def park(vehicle_id: str, vehicle_type: str = "4w"):
    """Park a vehicle. vehicle_type can be '2w' or '4w'."""
    return parking_system.park_vehicle(vehicle_id, vehicle_type)

@app.post("/leave/{vehicle_id}")
def leave(vehicle_id: str):
    return parking_system.remove_vehicle(vehicle_id)

@app.get("/status")
def status():
    return parking_system.get_status()

@app.post("/configure")
def configure(config: GridConfig):
    """Configure the parking grid dynamically.
    
    Parameters:
    - rows_2w_top: Number of 2-wheeler rows at top (default: 1)
    - rows_2w_bottom: Number of 2-wheeler rows at bottom (default: 1)
    - rows_4w: Number of 4-wheeler rows (default: 8)
    - cols: Number of columns (default: 19)
    """
    layout = config.generate_layout()
    result = parking_system.configure(layout)
    result["config"] = config.model_dump()
    return result

@app.get("/config")
def get_config():
    """Get current parking layout configuration."""
    return {
        "layout": parking_system.layout_map,
        "rows": parking_system.rows,
        "cols": parking_system.cols,
        "stats": {
            "2w_slots": len([s for s in parking_system.slot_category.values() if s == '2w']),
            "4w_slots": len([s for s in parking_system.slot_category.values() if s == '4w'])
        }
    }
