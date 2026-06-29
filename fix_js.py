import re
with open('frontend/app.js', 'r', encoding='utf-8') as f:
    c = f.read()
# The issue is we have container.innerHTML = \` instead of container.innerHTML = `
c = c.replace(r"\`", "`")

# The other issue is ${tryAgainFnStr} got rendered as \${tryAgainFnStr} 
# Wait, let me check if \${ is there.
c = c.replace(r"\${", "${")

with open('frontend/app.js', 'w', encoding='utf-8') as f:
    f.write(c)
