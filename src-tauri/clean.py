import subprocess
import json
import os
import re

while True:
    print("Running cargo check...")
    res = subprocess.run(["cargo", "check", "--message-format=json"], capture_output=True, text=True)
    if res.returncode == 0:
        print("Success! No errors.")
        break
    
    lines_to_fix = {}
    for line in res.stdout.splitlines():
        if not line.startswith("{"): continue
        try:
            msg = json.loads(line)
        except:
            continue
        
        if msg.get("reason") == "compiler-message" and msg.get("message", {}).get("code"):
            code = msg["message"]["code"]["code"]
            spans = msg["message"]["spans"]
            if not spans: continue
            
            primary_span = next((s for s in spans if s["is_primary"]), None)
            if not primary_span: continue
            
            file_name = primary_span["file_name"]
            line_num = primary_span["line_start"]
            
            if code == "E0308":
                if file_name not in lines_to_fix: lines_to_fix[file_name] = {}
                lines_to_fix[file_name][line_num] = "borrow"
                
            elif code == "E0596":
                if file_name not in lines_to_fix: lines_to_fix[file_name] = {}
                lines_to_fix[file_name][line_num] = "mut"
                
            elif code == "E0277":
                if file_name not in lines_to_fix: lines_to_fix[file_name] = {}
                lines_to_fix[file_name][line_num] = "borrow" # Many E0277 are trailing trait bound unresolved for the connection
                
    if not lines_to_fix:
        print("No automatic fixes available. Printing stderr:")
        print(res.stderr)
        break
        
    for fname, fixes in lines_to_fix.items():
        with open(fname, "r") as f:
            lines = f.readlines()
            
        for lnum, fxtype in fixes.items():
            idx = lnum - 1
            if fxtype == "borrow":
                # Replace exact `conn` but not `conn.` or `&conn`
                # Only match if not preceded by &, and not followed by .
                lines[idx] = re.sub(r'(?<!\&)\bconn\b(?!\.)', '&conn', lines[idx])
            elif fxtype == "mut":
                for i in range(idx, -1, -1):
                    if "let conn =" in lines[i]:
                        lines[i] = lines[i].replace("let conn =", "let mut conn =")
                        break
        
        with open(fname, "w") as f:
            f.writelines(lines)
            
    print(f"Applied fixes to {len(lines_to_fix)} files.")
