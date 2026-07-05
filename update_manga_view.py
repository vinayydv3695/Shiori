import re

with open('src/components/online/OnlineMangaView.tsx', 'r') as f:
    content = f.read()

# Update grid gaps
content = content.replace("gap-2 md:gap-4", "gap-3 md:gap-6")

# Update main flex container padding (if any)
# Look for <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden relative">
# The content is usually wrapped in a ScrollArea or similar.

with open('src/components/online/OnlineMangaView.tsx', 'w') as f:
    f.write(content)
