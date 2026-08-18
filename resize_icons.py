import os
from PIL import Image

def main():
    base_dir = "c:/Users/khais/Documents/GitHub/DUK-BusTracker"
    img_path = os.path.join(base_dir, "bus_logo.png")
    
    if not os.path.exists(img_path):
        print("Image not found at:", img_path)
        return
        
    img_rgba = Image.open(img_path).convert("RGBA")
    
    # Create a solid background matching the logo's dominant blue
    bg_color = (34, 71, 150, 255)
    img = Image.new("RGBA", img_rgba.size, bg_color)
    img.paste(img_rgba, (0, 0), img_rgba)
    
    # Sizes for standard Android Launcher Icons
    sizes = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192
    }
    
    for dpi, size in sizes.items():
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        out_dir = os.path.join(base_dir, "frontend", "android", "app", "src", "main", "res", f"mipmap-{dpi}")
        if not os.path.exists(out_dir):
            os.makedirs(out_dir, exist_ok=True)
            
        # Write ic_launcher and ic_launcher_round
        out_path = os.path.join(out_dir, "ic_launcher.png")
        resized.save(out_path)
        
        out_path_round = os.path.join(out_dir, "ic_launcher_round.png")
        resized.save(out_path_round)
        print(f"Saved {dpi} icons")

if __name__ == "__main__":
    main()
