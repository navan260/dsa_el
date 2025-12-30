from main import ParkingSystem
import networkx as nx

def test_parking_system():
    print("Initializing ParkingSystem...")
    ps = ParkingSystem()
    
    slots = [n for n, d in ps.graph.nodes(data=True) if d['type'] == 'slot']
    print(f"Slots: {len(slots)}")
    
    # Verify edge weights
    slot_slot_edges = []
    road_road_edges = []
    
    for u, v, w in ps.graph.edges(data='weight'):
        t1 = ps.graph.nodes[u]['type']
        t2 = ps.graph.nodes[v]['type']
        
        if t1 == 'slot' and t2 == 'slot':
            slot_slot_edges.append(w)
            if w < 100:
                print(f"ERROR: Slot-Slot edge {u}-{v} has low weight {w}!")
                
        if t1 == 'road' and t2 == 'road':
            road_road_edges.append(w)
            
    print(f"Slot-Slot edges: {len(slot_slot_edges)} (Expected high weights)")
    print(f"Road-Road edges: {len(road_road_edges)}")
    
    # Test Pathfinding Preference
    # Pick two slots far apart
    # Path should preferebly go through roads
    start_slot = slots[0]
    end_slot = slots[-1]
    
    print(f"Testing path from Slot {start_slot} to Slot {end_slot}...")
    try:
        path = nx.shortest_path(ps.graph, start_slot, end_slot, weight='weight')
        print(f"Path length: {len(path)}")
        
        # Analyze path types
        path_types = [ps.graph.nodes[n]['type'] for n in path]
        road_count = path_types.count('road')
        slot_count = path_types.count('slot')
        print(f"Path composition: {road_count} Roads, {slot_count} Slots")
        
        # We expect mostly roads.
        # Start and End are slots (2).
        # Any other slots?
        if slot_count > 2:
            print("WARNING: Path passes through intermediate slots!")
            print(f"Full path types: {path_types}")
        else:
            print("SUCCESS: Path uses roads correctly.")
            
    except Exception as e:
        print(f"Pathfinding failed: {e}")

if __name__ == "__main__":
    test_parking_system()
