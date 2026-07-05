import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Add import
if "SwipeGestureHandler" not in content:
    content = content.replace(
        "import { AndroidSplashScreen } from \"./components/ui/AndroidSplashScreen\"",
        "import { AndroidSplashScreen } from \"./components/ui/AndroidSplashScreen\"\nimport { SwipeGestureHandler } from \"./components/layout/SwipeGestureHandler\""
    )

# Wrap renderContent with SwipeGestureHandler
# Currently:
#   return (
#     <>
#       {!splashFinished && (
#         <AndroidSplashScreen
#           isReady={isAppReady}
#           onAnimationEnd={() => setSplashFinished(true)}
#         />
#       )}
#       {renderContent()}
#     </>
#   )

pattern = r"(<AndroidSplashScreen[\s\S]*?/>\n\s*\)}\n\s*)(?:\{renderContent\(\)\})"
replacement = r"\1<SwipeGestureHandler>\n        {renderContent()}\n      </SwipeGestureHandler>"
content = re.sub(pattern, replacement, content)

with open('src/App.tsx', 'w') as f:
    f.write(content)
