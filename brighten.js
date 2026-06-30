const fs = require('fs');
let css = fs.readFileSync('frontend/style.css', 'utf8');

// Increase all rgba alpha values
css = css.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g, (match, r, g, b, a) => {
    let alpha = parseFloat(a);
    if (r === '255' && g === '255' && b === '255') {
        // White overlays/text - boost opacity
        if (alpha < 0.6) {
            alpha = Math.min(0.9, alpha + 0.25);
        } else if (alpha < 0.8) {
            alpha = Math.min(1.0, alpha + 0.15);
        }
    } else {
        // Colorful overlays (green, orange, cyan, etc) - boost opacity
        if (alpha < 0.8) {
            alpha = Math.min(1.0, alpha * 2.2);
        }
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
});

// Make background gradients slightly brighter and richer
css = css.replace(/#0a1f1f/g, '#133939')
         .replace(/#0d3a2e/g, '#185d49')
         .replace(/#061818/g, '#0f2929');
         
// Increase contrast for dark element backgrounds
css = css.replace(/#030d0d/g, '#051616');

fs.writeFileSync('frontend/style.css', css);
console.log("CSS opacity and colors updated!");
