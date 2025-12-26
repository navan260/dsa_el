export interface Node {
    id: number;
    x: number;
    y: number;
    filled: boolean;
    vehicle_id: string | null;
    is_entry: boolean;
}

export interface Edge {
    source: number;
    target: number;
}

export interface ParkingState {
    nodes: Node[];
    edges: Edge[];
}

export interface AllocationResponse {
    message: string;
    slot_id: number;
    path: number[]; // List of node IDs
}

const API_URL = "http://localhost:8000";

export const getStatus = async (): Promise<ParkingState> => {
    const response = await fetch(`${API_URL}/status`);
    if (!response.ok) throw new Error("Failed to fetch status");
    return response.json();
};

export const parkVehicle = async (vehicleId: string): Promise<AllocationResponse> => {
    const response = await fetch(`${API_URL}/park/${vehicleId}`, {
        method: "POST",
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to park");
    }
    return response.json();
};

export const removeVehicle = async (vehicleId: string): Promise<any> => {
    const response = await fetch(`${API_URL}/leave/${vehicleId}`, {
        method: "POST",
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to leave");
    }
    return response.json();
};
