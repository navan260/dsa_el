export interface Node {
    id: number;
    x: number;
    y: number;
    type: 'road' | 'slot';
    filled: boolean;
    vehicle_id: string | null;
    vehicle_type: '2w' | '4w' | null;
    slot_category: '2w' | '4w' | null;
    is_entry: boolean;
}

export interface Edge {
    source: number;
    target: number;
}

export interface Stats {
    '2w': { total: number; available: number };
    '4w': { total: number; available: number };
}

export interface ParkingState {
    nodes: Node[];
    edges: Edge[];
    stats?: Stats;
}

export interface AllocationResponse {
    message: string;
    slot_id: number;
    vehicle_type: '2w' | '4w';
    path: number[]; // List of node IDs
}

const API_URL = "http://localhost:8000";

export const getStatus = async (): Promise<ParkingState> => {
    const response = await fetch(`${API_URL}/status`);
    if (!response.ok) throw new Error("Failed to fetch status");
    return response.json();
};

export const parkVehicle = async (vehicleId: string, vehicleType: '2w' | '4w' = '4w'): Promise<AllocationResponse> => {
    const response = await fetch(`${API_URL}/park/${vehicleId}?vehicle_type=${vehicleType}`, {
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

export interface GridConfig {
    rows_2w_top: number;
    rows_2w_bottom: number;
    rows_4w: number;
    cols: number;
    cols_4w: number;
}

export const configureGrid = async (config: GridConfig): Promise<any> => {
    const response = await fetch(`${API_URL}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to configure");
    }
    return response.json();
};
