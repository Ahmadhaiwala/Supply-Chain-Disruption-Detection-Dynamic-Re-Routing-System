"""
Graph-based routing engine using networkx.
Builds a road network graph from origin-destination pairs and
computes top-K alternative routes using A* / Yen's K-shortest paths.
"""
import math
import logging
from typing import List, Tuple, Optional, Dict, Any

import networkx as nx
import numpy as np

logger = logging.getLogger(__name__)

# ─── Ahmedabad region waypoint registry ───────────────────────────────────────
# Key intermediate nodes for the Ahmedabad-Mumbai corridor demo
REGION_NODES: Dict[str, Tuple[float, float]] = {
    "Ahmedabad": (23.0225, 72.5714),
    "Sanand": (22.9925, 72.3847),
    "Bavla": (22.8333, 72.3667),
    "Nadiad": (22.6916, 72.8634),
    "Anand": (22.5645, 72.9289),
    "Vadodara": (22.3072, 73.1812),
    "Bharuch": (21.7051, 72.9959),
    "Surat": (21.1702, 72.8311),
    "Vapi": (20.3714, 72.9101),
    "Mumbai": (19.0760, 72.8777),
    "Mundra_Port": (22.8390, 69.7220),
    "Rajkot": (22.3039, 70.8022),
    "Gandhinagar": (23.2156, 72.6369),
}

# Road edges: (from, to, distance_km, base_speed_kmh)
REGION_EDGES = [
    ("Ahmedabad", "Sanand", 30, 60),
    ("Ahmedabad", "Gandhinagar", 25, 70),
    ("Ahmedabad", "Nadiad", 60, 80),
    ("Sanand", "Bavla", 25, 60),
    ("Bavla", "Nadiad", 50, 70),
    ("Nadiad", "Anand", 20, 80),
    ("Anand", "Vadodara", 45, 90),
    ("Vadodara", "Bharuch", 80, 90),
    ("Bharuch", "Surat", 90, 90),
    ("Surat", "Vapi", 80, 90),
    ("Vapi", "Mumbai", 180, 80),
    ("Ahmedabad", "Rajkot", 200, 90),
    ("Rajkot", "Mundra_Port", 180, 80),
    ("Ahmedabad", "Mundra_Port", 350, 75),
]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class SupplyChainGraph:
    """
    Weighted directed graph of the supply chain road network.
    Edge weight = estimated travel time in minutes.
    """

    def __init__(self):
        self.G = nx.DiGraph()
        self._build_default_graph()

    def _build_default_graph(self):
        """Populate graph with Ahmedabad-region nodes and edges."""
        for name, (lat, lon) in REGION_NODES.items():
            self.G.add_node(name, lat=lat, lon=lon)

        for src, dst, dist_km, speed_kmh in REGION_EDGES:
            travel_min = (dist_km / speed_kmh) * 60
            self.G.add_edge(src, dst, weight=travel_min, distance_km=dist_km, speed_kmh=speed_kmh)
            self.G.add_edge(dst, src, weight=travel_min, distance_km=dist_km, speed_kmh=speed_kmh)

        logger.info("SupplyChainGraph built: %d nodes, %d edges", self.G.number_of_nodes(), self.G.number_of_edges())

    def add_shipment_nodes(self, origin_lat: float, origin_lon: float,
                           dest_lat: float, dest_lon: float) -> Tuple[str, str]:
        """
        Add dynamic origin/destination nodes and connect them to nearest graph nodes.
        Returns (origin_node_id, dest_node_id).
        """
        origin_id = f"ORIGIN_{origin_lat:.4f}_{origin_lon:.4f}"
        dest_id = f"DEST_{dest_lat:.4f}_{dest_lon:.4f}"

        self.G.add_node(origin_id, lat=origin_lat, lon=origin_lon)
        self.G.add_node(dest_id, lat=dest_lat, lon=dest_lon)

        # Connect to 3 nearest existing nodes
        for node_id, (lat, lon) in REGION_NODES.items():
            dist = haversine_km(origin_lat, origin_lon, lat, lon)
            travel_min = (dist / 60) * 60  # assume 60 km/h
            self.G.add_edge(origin_id, node_id, weight=travel_min, distance_km=dist)
            self.G.add_edge(node_id, origin_id, weight=travel_min, distance_km=dist)

            dist2 = haversine_km(dest_lat, dest_lon, lat, lon)
            travel_min2 = (dist2 / 60) * 60
            self.G.add_edge(dest_id, node_id, weight=travel_min2, distance_km=dist2)
            self.G.add_edge(node_id, dest_id, weight=travel_min2, distance_km=dist2)

        return origin_id, dest_id

    def get_k_shortest_paths(self, source: str, target: str, k: int = 3) -> List[List[str]]:
        """
        Returns up to k simple paths ordered by total weight (travel time).
        Uses Yen's algorithm via networkx.
        """
        try:
            paths = list(nx.shortest_simple_paths(self.G, source, target, weight="weight"))
            return paths[:k]
        except nx.NetworkXNoPath:
            logger.warning("No path found from %s to %s", source, target)
            return []
        except Exception as e:
            logger.error("Path computation error: %s", e)
            return []

    def path_stats(self, path: List[str]) -> Dict[str, float]:
        """Compute total travel time (minutes) and distance (km) for a path."""
        total_time = 0.0
        total_dist = 0.0
        for i in range(len(path) - 1):
            edge = self.G.edges[path[i], path[i + 1]]
            total_time += edge.get("weight", 0)
            total_dist += edge.get("distance_km", 0)
        return {"travel_time_minutes": round(total_time, 1), "distance_km": round(total_dist, 1)}

    def path_waypoints(self, path: List[str]) -> List[List[float]]:
        """Convert node path to [[lat, lon], ...] waypoints."""
        waypoints = []
        for node in path:
            data = self.G.nodes[node]
            waypoints.append([data.get("lat", 0.0), data.get("lon", 0.0)])
        return waypoints

    def apply_congestion(self, edge_congestion: Dict[Tuple[str, str], float]):
        """
        Dynamically update edge weights based on congestion scores [0, 1].
        congestion=1.0 doubles travel time.
        """
        for (src, dst), congestion in edge_congestion.items():
            if self.G.has_edge(src, dst):
                base = self.G.edges[src, dst].get("weight", 0)
                self.G.edges[src, dst]["weight"] = base * (1 + congestion)


def build_route_options(
    graph: SupplyChainGraph,
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    current_risk_score: float,
    max_routes: int = 3,
) -> List[Dict[str, Any]]:
    """
    Generate ranked route options with risk, ETA, and cost estimates.

    Returns list of dicts matching RouteOption schema.
    """
    origin_id, dest_id = graph.add_shipment_nodes(origin_lat, origin_lon, dest_lat, dest_lon)
    paths = graph.get_k_shortest_paths(origin_id, dest_id, k=max_routes + 1)

    if not paths:
        # Fallback: straight-line estimate
        dist = haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
        return [{
            "rank": 1,
            "label": "Direct Route",
            "waypoints": [[origin_lat, origin_lon], [dest_lat, dest_lon]],
            "estimated_eta_minutes": round((dist / 60) * 60, 1),
            "delay_risk": current_risk_score,
            "extra_cost_inr": 0.0,
            "distance_km": round(dist, 1),
            "is_recommended": True,
        }]

    options = []
    base_time = None

    for rank, path in enumerate(paths[:max_routes], start=1):
        stats = graph.path_stats(path)
        waypoints = graph.path_waypoints(path)

        if base_time is None:
            base_time = stats["travel_time_minutes"]

        # Risk decreases for alternative routes (heuristic: each alt reduces risk by 40-60%)
        if rank == 1:
            route_risk = current_risk_score
            extra_cost = 0.0
            label = "Current Route"
        else:
            reduction = 0.5 + (rank - 2) * 0.1  # 50%, 60% reduction
            route_risk = round(max(current_risk_score * (1 - reduction), 0.05), 3)
            # Cost proportional to extra distance
            extra_dist = stats["distance_km"] - (options[0]["distance_km"] if options else stats["distance_km"])
            extra_cost = round(max(extra_dist * 2.5, 0), 0)  # ₹2.5/km extra
            label = _route_label(path, rank)

        options.append({
            "rank": rank,
            "label": label,
            "waypoints": waypoints,
            "estimated_eta_minutes": stats["travel_time_minutes"],
            "delay_risk": route_risk,
            "extra_cost_inr": extra_cost,
            "distance_km": stats["distance_km"],
            "is_recommended": rank == _best_route_rank(options + [{
                "rank": rank, "delay_risk": route_risk, "extra_cost_inr": extra_cost
            }]),
        })

    # Mark the recommended route
    best_rank = _best_route_rank(options)
    for opt in options:
        opt["is_recommended"] = (opt["rank"] == best_rank)

    return options


def _route_label(path: List[str], rank: int) -> str:
    """Generate a human-readable label from intermediate nodes."""
    intermediates = [n for n in path if not n.startswith("ORIGIN_") and not n.startswith("DEST_")]
    if len(intermediates) >= 2:
        via = intermediates[len(intermediates) // 2]
        return f"Via {via}"
    return f"Alternative Route {rank}"


def _best_route_rank(options: List[Dict]) -> int:
    """
    Simple Pareto scoring: minimize risk × 0.7 + normalized_cost × 0.3.
    Returns rank of best option.
    """
    if not options:
        return 1
    max_cost = max(o.get("extra_cost_inr", 0) for o in options) or 1
    scores = []
    for o in options:
        cost_norm = o.get("extra_cost_inr", 0) / max_cost
        score = 0.7 * o.get("delay_risk", 0) + 0.3 * cost_norm
        scores.append((score, o.get("rank", 1)))
    return min(scores, key=lambda x: x[0])[1]


# Singleton graph instance
_graph: Optional[SupplyChainGraph] = None


def get_graph() -> SupplyChainGraph:
    global _graph
    if _graph is None:
        _graph = SupplyChainGraph()
    return _graph
