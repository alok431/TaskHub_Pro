import re

css_path = r"C:\TaskHub_Pro\frontend\style.css"
with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()

# The Emerald theme colors
bg_color = "#042c23" # Very dark green
card_bg = "#0e4d3c" # Dark green card
primary_color = "#35d398" # Bright mint green
primary_glow = "rgba(53, 211, 152, 0.4)"
secondary_btn = "#11604a"
accent_color = "#fcd34d"

# Replace universal app container
css = re.sub(r"\.app-container\s*\{[^}]*\}", 
             ".app-container {\n    background: " + bg_color + ";\n    width: 100%;\n    max-width: 480px;\n    height: 100%;\n    color: white;\n    display: flex;\n    flex-direction: column;\n    overflow: hidden;\n    box-shadow: 0 0 30px rgba(0, 0, 0, 1.00);\n}", 
             css)

# Replace body bg
css = re.sub(r"body\s*\{[^}]*background-color:[^}]*\}", 
             "body {\n    font-family: 'Poppins', 'Outfit', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;\n    background-color: #021a14;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n}", 
             css)

# Replace header
css = re.sub(r"\.header\s*\{[^}]*\}", 
             ".header {\n    background: " + bg_color + ";\n    padding: 12px 14px;\n    position: sticky;\n    top: 0;\n    z-index: 100;\n}", 
             css)

# Replace cards (featured, spin, task)
css = re.sub(r"\.featured-card\s*\{[^}]*\}", 
             ".featured-card {\n    background: " + card_bg + ";\n    border-radius: 12px;\n    padding: 14px;\n    margin-bottom: 12px;\n    position: relative;\n    overflow: hidden;\n    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);\n}", 
             css)

css = re.sub(r"\.spin-card\s*\{[^}]*\}", 
             ".spin-card {\n    background: " + card_bg + ";\n    border-radius: 12px;\n    padding: 14px;\n    margin-bottom: 12px;\n    text-align: center;\n    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);\n}", 
             css)

css = re.sub(r"\.streak-card\s*\{[^}]*\}", 
             ".streak-card {\n    background: " + card_bg + ";\n    border-radius: 12px;\n    padding: 16px;\n    margin-bottom: 16px;\n    display: flex;\n    flex-direction: column;\n    gap: 12px;\n}", 
             css)
             
css = re.sub(r"\.task-card\s*\{[^}]*\}", 
             ".task-card {\n    background: " + card_bg + ";\n    border-radius: 10px;\n    padding: 12px;\n    margin-bottom: 8px;\n    transition: all 0.25s ease;\n}", 
             css)

# Buttons
css = re.sub(r"\.btn-primary\s*\{[^}]*\}", 
             ".btn-primary {\n    padding: 12px 12px;\n    background: " + primary_color + ";\n    border: none;\n    border-radius: 8px;\n    color: white;\n    font-weight: 700;\n    font-size: 13px;\n    cursor: pointer;\n    transition: all 0.2s ease;\n    width: 100%;\n    margin-top: 6px;\n    text-align: center;\n    box-shadow: 0 0 15px " + primary_glow + ";\n}", 
             css)

css = re.sub(r"\.btn-primary-wide\s*\{[^}]*\}", 
             ".btn-primary-wide {\n    width: 100%;\n    padding: 12px 16px;\n    background: " + primary_color + ";\n    border: none;\n    border-radius: 8px;\n    color: white;\n    font-weight: 700;\n    font-size: 14px;\n    cursor: pointer;\n    transition: all 0.2s ease;\n    box-shadow: 0 0 15px " + primary_glow + ";\n}", 
             css)
             
css = re.sub(r"\.btn-secondary\s*\{[^}]*\}", 
             ".btn-secondary {\n    padding: 12px 12px;\n    background: " + secondary_btn + ";\n    border: none;\n    border-radius: 8px;\n    color: white;\n    font-weight: 700;\n    font-size: 13px;\n    cursor: pointer;\n    transition: all 0.2s ease;\n    width: 100%;\n    margin-top: 6px;\n    text-align: center;\n}", 
             css)

# Stat boxes
css = re.sub(r"\.stat-mini\s*\{[^}]*\}", 
             ".stat-mini {\n    background: rgba(255, 255, 255, 0.05);\n    padding: 6px 4px;\n    border-radius: 8px;\n    text-align: center;\n    transition: all 0.2s ease;\n}", 
             css)

# Tab Bar
css = re.sub(r"\.tab-bar\s*\{[^}]*\}", 
             ".tab-bar {\n    position: fixed;\n    bottom: 0;\n    left: 50%;\n    transform: translateX(-50%);\n    width: 100%;\n    max-width: 480px;\n    z-index: 999;\n    display: grid;\n    grid-template-columns: repeat(6, 1fr);\n    gap: 4px;\n    background: " + card_bg + ";\n    padding: 10px 4px calc(14px + env(safe-area-inset-bottom, 0px));\n    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);\n}", 
             css)
             
# Tab btn active
css = re.sub(r"\.tab-btn\.active\s*\{[^}]*\}", 
             ".tab-btn.active {\n    background: rgba(255,255,255,0.05);\n    color: " + primary_color + ";\n}", 
             css)

css = re.sub(r"\.tab-btn\.active span\s*\{[^}]*\}", 
             ".tab-btn.active span {\n    color: " + primary_color + ";\n}", 
             css)

# Global text replacements
css = css.replace("#10b981", primary_color)
css = css.replace("#059669", secondary_btn)
css = css.replace("#f59e0b", accent_color)
css = css.replace("linear-gradient(135deg, #10b981, #f59e0b, #06b6d4)", "white")

with open(css_path, "w", encoding="utf-8") as f:
    f.write(css)

print("CSS updated successfully.")
