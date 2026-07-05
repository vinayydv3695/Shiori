import re

with open('src/components/online/OnlineResultCard.tsx', 'r') as f:
    content = f.read()

# Update the card container
pattern = r"\'group relative flex rounded-xl border border-border bg-card/60 backdrop-blur-sm\',"
replacement = "'group relative flex rounded-2xl border border-border/60 bg-card/60 backdrop-blur-md',"
content = re.sub(pattern, replacement, content)

# Update the mobile image
pattern = r"\'max-md:w-full max-md:aspect-\[2/3\] max-md:rounded-none max-md:border-none\'"
replacement = "'max-md:w-full max-md:aspect-[2/3] max-md:rounded-2xl max-md:border-none'"
content = re.sub(pattern, replacement, content)

# Update the mobile text content area
pattern = r"\'max-md:absolute max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:bg-background/60 max-md:backdrop-blur-md max-md:border-t max-md:border-white/10 max-md:p-2 max-md:z-10\'"
replacement = "'max-md:absolute max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:bg-surface-container-low/70 max-md:backdrop-blur-xl max-md:border-t max-md:border-white/5 max-md:p-3 max-md:rounded-b-2xl max-md:z-10'"
content = re.sub(pattern, replacement, content)

with open('src/components/online/OnlineResultCard.tsx', 'w') as f:
    f.write(content)
