import re

with open('src/index.css', 'r') as f:
    content = f.read()

# Regex to find @keyframes splash-logo { ... } .animate-splash-logo { ... }
pattern = r'@keyframes splash-logo \{.*?\n\}\n\.animate-splash-logo \{.*?\n\}'

replacement = """@keyframes splash-reveal {
  0% { transform: scale(0.85); opacity: 0; filter: blur(12px); }
  100% { transform: scale(1); opacity: 1; filter: blur(0px); }
}

@keyframes splash-pulse-glow {
  0%, 100% { filter: drop-shadow(0 0 10px rgba(198, 198, 199, 0.2)); }
  50% { filter: drop-shadow(0 0 35px rgba(174, 198, 255, 0.5)); }
}

@keyframes text-slide-up {
  0% { transform: translateY(20px); opacity: 0; letter-spacing: 0.3em; }
  100% { transform: translateY(0); opacity: 1; letter-spacing: 0.6em; }
}

.animate-splash-logo {
  animation: splash-reveal 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards, splash-pulse-glow 4s ease-in-out 1.2s infinite;
}

.animate-splash-text {
  animation: text-slide-up 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards;
  opacity: 0;
}

.splash-gradient {
  background: radial-gradient(circle at center, rgba(32,31,31,0.5) 0%, rgba(14,14,14,0.9) 100%);
}
"""

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/index.css', 'w') as f:
    f.write(new_content)
