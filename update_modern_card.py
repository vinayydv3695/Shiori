import re

with open('src/components/online/ModernBookCard.tsx', 'r') as f:
    content = f.read()

# Update the card container rounded corners
content = content.replace("aspect-[2/3] rounded-xl bg-secondary/40", "aspect-[2/3] rounded-2xl bg-secondary/40")

# Update the Info strip classes
pattern = r"\'max-md:bg-background/60 max-md:backdrop-blur-md max-md:border-t max-md:border-white/10 max-md:pt-2 max-md:pb-2 max-md:px-2\',"
replacement = "'max-md:bg-surface-container-low/70 max-md:backdrop-blur-xl max-md:border-t max-md:border-white/5 max-md:pt-2.5 max-md:pb-2.5 max-md:px-2.5',"
content = re.sub(pattern, replacement, content)

with open('src/components/online/ModernBookCard.tsx', 'w') as f:
    f.write(content)
