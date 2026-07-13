#!/usr/bin/env python3
import os
import json
import random
import colorsys

def get_pastel_color(index, total):
    hue = index / total
    saturation = 0.6 + random.random() * 0.2  # 0.6 - 0.8
    lightness = 0.7 + random.random() * 0.1   # 0.7 - 0.8
    
    r, g, b = colorsys.hls_to_rgb(hue, lightness, saturation)
    return int(r * 255) << 16 | int(g * 255) << 8 | int(b * 255)

def main():
    graph_json_path = "graphify-out/graph.json"
    labels_json_path = "graphify-out/.graphify_labels.json"
    obsidian_dir = "graphify-out/wiki/.obsidian"
    obsidian_graph_json = os.path.join(obsidian_dir, "graph.json")
    
    if not os.path.exists(graph_json_path):
        print(f"Error: {graph_json_path} not found.")
        return
        
    if not os.path.exists(labels_json_path):
        print(f"Error: {labels_json_path} not found.")
        return

    with open(graph_json_path, 'r') as f:
        graph_data = json.load(f)
        
    with open(labels_json_path, 'r') as f:
        labels_data = json.load(f)

    # Group files by community
    community_files = {}
    
    # In graphify, wiki pages are usually created for source_files and communities
    # We will gather all labels that have a .md file
    wiki_files = set()
    if os.path.exists("graphify-out/wiki"):
        for f in os.listdir("graphify-out/wiki"):
            if f.endswith(".md"):
                wiki_files.add(f[:-3]) # strip .md

    for node in graph_data.get("nodes", []):
        community = str(node.get("community", ""))
        if not community:
            continue
            
        label = node.get("label", "")
        # Also include the community label itself
        comm_label = labels_data.get(community, "")
        
        if community not in community_files:
            community_files[community] = set()
            
        if label in wiki_files:
            community_files[community].add(label)
        if comm_label in wiki_files:
            community_files[community].add(comm_label)
            
    # Filter out empty communities
    community_files = {k: v for k, v in community_files.items() if v}
    
    color_groups = []
    total_communities = len(community_files)
    
    for i, (community, files) in enumerate(community_files.items()):
        # Build Obsidian search query
        # Using file:(A OR B OR C)
        # Split into chunks if too many files to avoid max length
        file_list = list(files)
        chunk_size = 50
        
        color_rgb = get_pastel_color(i, total_communities)
        
        for j in range(0, len(file_list), chunk_size):
            chunk = file_list[j:j+chunk_size]
            query = " OR ".join([f'"{f}"' for f in chunk])
            query = f"file:({query})"
            
            color_groups.append({
                "query": query,
                "color": {
                    "a": 1,
                    "rgb": color_rgb
                }
            })
            
    # Ensure .obsidian dir exists
    os.makedirs(obsidian_dir, exist_ok=True)
    
    # Load existing or create new graph.json
    obsidian_config = {}
    if os.path.exists(obsidian_graph_json):
        with open(obsidian_graph_json, 'r') as f:
            try:
                obsidian_config = json.load(f)
            except:
                pass
                
    obsidian_config["colorGroups"] = color_groups
    
    with open(obsidian_graph_json, 'w') as f:
        json.dump(obsidian_config, f, indent=2)
        
    print(f"Successfully generated {len(color_groups)} color groups for {total_communities} communities.")
    print(f"Saved to {obsidian_graph_json}")

if __name__ == "__main__":
    main()
