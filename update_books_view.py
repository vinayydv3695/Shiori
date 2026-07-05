import re

with open('src/components/online/OnlineBooksView.tsx', 'r') as f:
    content = f.read()

# Update grid gaps
content = content.replace("gap-2 md:gap-4", "gap-3 md:gap-6")

with open('src/components/online/OnlineBooksView.tsx', 'w') as f:
    f.write(content)
