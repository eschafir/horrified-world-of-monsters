"""BFS pathfinding shared by monster auto-movement and hero/citizen-targeting logic."""
from typing import Dict, List, Optional, Set

from src.data_loader import ADJACENCY_LIST


def _bfs_all_paths(start: str, adjacency: Dict) -> Dict[str, List[List[str]]]:
    """All shortest paths (with alphabetical-tiebreak-friendly duplicates) from start to
    every reachable node."""
    paths = {start: [[start]]}
    queue = [start]

    while queue:
        node = queue.pop(0)
        curr_len = len(paths[node][0])

        for neighbor in adjacency.get(node, []):
            if neighbor not in paths:
                paths[neighbor] = [p + [neighbor] for p in paths[node]]
                queue.append(neighbor)
            elif len(paths[neighbor][0]) == curr_len + 1:
                for p in paths[node]:
                    paths[neighbor].append(p + [neighbor])

    return paths


def find_shortest_path(start: str, targets: Set[str], adjacency: Dict = None) -> Optional[str]:
    """Returns the next location on the shortest path towards any of the target nodes."""
    if not targets or start in targets:
        return start

    if adjacency is None:
        adjacency = ADJACENCY_LIST

    paths = _bfs_all_paths(start, adjacency)

    target_dists = {t: len(paths[t][0]) for t in targets if t in paths}
    if not target_dists:
        return start

    min_dist = min(target_dists.values())
    best_targets = [t for t, d in target_dists.items() if d == min_dist]
    best_targets.sort()
    target = best_targets[0]

    target_paths = paths[target]
    target_paths.sort(key=lambda p: tuple(p))

    if len(target_paths[0]) > 1:
        return target_paths[0][1]
    return start


def get_best_monster_move(start: str, hero_targets: Set[str], citizen_targets: Set[str], adjacency: Dict = None) -> Optional[str]:
    """Finds best move, preferring heroes if equidistant."""
    if start in hero_targets or start in citizen_targets:
        return start

    if adjacency is None:
        adjacency = ADJACENCY_LIST

    paths = _bfs_all_paths(start, adjacency)

    hero_dists = {t: len(paths[t][0]) for t in hero_targets if t in paths}
    cit_dists = {t: len(paths[t][0]) for t in citizen_targets if t in paths}

    min_h = min(hero_dists.values()) if hero_dists else 999
    min_c = min(cit_dists.values()) if cit_dists else 999

    if min_h == 999 and min_c == 999:
        return start

    if min_h <= min_c:
        best_targets = [t for t, d in hero_dists.items() if d == min_h]
    else:
        best_targets = [t for t, d in cit_dists.items() if d == min_c]

    best_targets.sort()
    target = best_targets[0]

    target_paths = paths[target]
    target_paths.sort(key=lambda p: tuple(p))

    if len(target_paths[0]) > 1:
        return target_paths[0][1]
    return start
