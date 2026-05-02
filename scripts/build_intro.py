#!/usr/bin/env python3
"""
TCG Oracle — 5-Second Full-Bleed Intro
NFTs fill the ENTIRE screen. No borders, no dead space.
Text overlaid directly on the art. Maximum impact.
"""
import os, sys, math, random, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

# ─── CONFIG ───
W, H = 652, 1176
FPS = 50
DURATION = 5.0
TOTAL_FRAMES = int(FPS * DURATION)
FRAME_DIR = "/tmp/intro_frames"
NFT_DIR = os.path.expanduser("~/Documents/Meme Merchants/hashlips_art_engine/build_undesirables/images")
OUTPUT = os.path.expanduser("~/Documents/Meme Merchants/tcg-oracle-app/tcg_oracle_intro.mp4")
DEMO_VIDEO = os.path.expanduser("~/Downloads/TCG ORACLE DEMO .mp4")
FINAL_OUTPUT = os.path.expanduser("~/Documents/Meme Merchants/tcg-oracle-app/TCG_Oracle_Demo_Final.mp4")

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
NEON_PINK = (255, 40, 130)
NEON_CYAN = (0, 240, 255)
GOLD = (255, 200, 60)
DEEP_BLACK = (8, 8, 12)

DIDOT = "/System/Library/Fonts/Supplemental/Didot.ttc"
IMPACT = "/System/Library/Fonts/Supplemental/Impact.ttf"
AVENIR = "/System/Library/Fonts/Avenir Next.ttc"

os.makedirs(FRAME_DIR, exist_ok=True)

# ─── LOAD NFTs ───
random.seed(4444)
all_nfts = sorted(glob.glob(os.path.join(NFT_DIR, "*.png")))
indices = sorted(random.sample(range(len(all_nfts)), min(24, len(all_nfts))))
selected_paths = [all_nfts[i] for i in indices]

print(f"Loading {len(selected_paths)} NFTs...")
nft_images = []
for p in selected_paths:
    img = Image.open(p).convert("RGB")
    nft_images.append(img)
print(f"Loaded {len(nft_images)} NFTs")

# ─── FULL BLEED RESIZE ───
def fill_frame(nft, w=W, h=H):
    """Scale NFT to FILL entire frame (crop overflow, no letterbox)"""
    iw, ih = nft.size
    scale = max(w / iw, h / ih)
    new_w = int(iw * scale)
    new_h = int(ih * scale)
    resized = nft.resize((new_w, new_h), Image.LANCZOS)
    # Center crop
    left = (new_w - w) // 2
    top = (new_h - h) // 2
    return resized.crop((left, top, left + w, top + h))

# ─── EFFECTS ───
def glitch(img, intensity=30):
    a = np.array(img).copy()
    h = a.shape[0]
    for _ in range(max(1, intensity // 8)):
        y = random.randint(0, h - 30)
        sl_h = random.randint(3, 25)
        shift = random.randint(-intensity, intensity)
        sl = a[y:y+sl_h].copy()
        a[y:y+sl_h] = np.roll(sl, shift, axis=1)
    return Image.fromarray(a)

def rgb_shift(img, offset=15):
    a = np.array(img).copy()
    a[:, :, 0] = np.roll(a[:, :, 0], offset, axis=1)
    a[:, :, 2] = np.roll(a[:, :, 2], -offset, axis=1)
    return Image.fromarray(a)

def scanlines(img, opacity=40):
    """CRT scanline overlay"""
    a = np.array(img).copy()
    a[::3, :, :] = np.clip(a[::3, :, :].astype(int) - opacity, 0, 255).astype(np.uint8)
    return Image.fromarray(a)

def vignette(img, strength=0.6):
    w, h = img.size
    vig = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(vig)
    cx, cy = w // 2, h // 2
    max_r = math.sqrt(cx**2 + cy**2)
    for r in range(int(max_r), 0, -3):
        brightness = int(255 * (1 - strength * (r / max_r) ** 1.5))
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=brightness)
    return Image.composite(img, Image.new("RGB", (w, h), BLACK), vig)

def outlined_text(draw, xy, text, font, fill=WHITE, outline=BLACK, ow=3):
    x, y = xy
    for dx in range(-ow, ow+1):
        for dy in range(-ow, ow+1):
            if dx or dy:
                draw.text((x+dx, y+dy), text, font=font, fill=outline)
    draw.text(xy, text, font=font, fill=fill)

def ken_burns_fill(nft, w, h, progress, zoom_start=1.0, zoom_end=1.15):
    """Ken Burns on already-filled frame"""
    z = zoom_start + (zoom_end - zoom_start) * progress
    filled = fill_frame(nft, int(w * z), int(h * z))
    left = (filled.size[0] - w) // 2
    top = (filled.size[1] - h) // 2
    return filled.crop((left, top, left + w, top + h))

def color_grade(img, warmth=1.1, saturation=1.2):
    """Cinematic color grade"""
    img = ImageEnhance.Color(img).enhance(saturation)
    # Warm tint
    a = np.array(img).copy().astype(np.float32)
    a[:,:,0] = np.clip(a[:,:,0] * warmth, 0, 255)       # Boost reds
    a[:,:,2] = np.clip(a[:,:,2] * 0.92, 0, 255)          # Reduce blues
    return Image.fromarray(a.astype(np.uint8))

# ─── PRE-PROCESS: fill all NFTs to full frame ───
print("Pre-processing NFTs to full-bleed frames...")
nft_filled = [fill_frame(n) for n in nft_images]

# ─── BEATS ───
BEATS = [0.0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.1, 2.4, 2.7, 3.0, 3.25, 3.5, 3.7, 3.85, 4.0, 4.15, 4.3, 4.45, 4.6]

# ─── FONTS ───
try:
    FONT_DIDOT_LG = ImageFont.truetype(DIDOT, 56)
    FONT_DIDOT_MD = ImageFont.truetype(DIDOT, 42)
    FONT_AVENIR_MD = ImageFont.truetype(AVENIR, 24)
    FONT_AVENIR_SM = ImageFont.truetype(AVENIR, 18)
    FONT_IMPACT_LG = ImageFont.truetype(IMPACT, 60)
    FONT_IMPACT_SM = ImageFont.truetype(IMPACT, 36)
except:
    FONT_DIDOT_LG = FONT_DIDOT_MD = FONT_AVENIR_MD = FONT_AVENIR_SM = FONT_IMPACT_LG = FONT_IMPACT_SM = ImageFont.load_default()

# ─── RENDER ───
print(f"Rendering {TOTAL_FRAMES} frames at {W}x{H} @ {FPS}fps...")

nft_idx = 0
for f in range(TOTAL_FRAMES):
    t = f / FPS
    progress = f / TOTAL_FRAMES
    is_beat = any(abs(t - b) < 0.04 for b in BEATS)

    if is_beat:
        nft_idx = (nft_idx + 1) % len(nft_filled)

    # ─── PHASE 1: Cinematic eye reveal (0–1.2s) ───
    if t < 1.2:
        nft = nft_images[0]  # Use original (not pre-filled) for crop control
        iw, ih = nft.size
        
        # Slow pan across the eyes — FULL WIDTH
        crop_cy = int(ih * 0.32)
        crop_h = int(ih * 0.35)
        crop_top = max(0, crop_cy - crop_h // 2)
        crop_bot = min(ih, crop_top + crop_h)
        
        eye_crop = nft.crop((0, crop_top, iw, crop_bot))
        # Scale to fill entire width, let height overflow and center
        scale = W / eye_crop.size[0]
        new_h = int(eye_crop.size[1] * scale)
        if new_h < H:
            scale = H / eye_crop.size[1]
        new_w = int(eye_crop.size[0] * scale)
        new_h = int(eye_crop.size[1] * scale)
        eye_crop = eye_crop.resize((max(new_w, W), max(new_h, H)), Image.LANCZOS)
        
        # Slow horizontal pan
        pan_x = int((eye_crop.size[0] - W) * (t / 1.2) * 0.3)
        pan_y = (eye_crop.size[1] - H) // 2
        img = eye_crop.crop((pan_x, pan_y, pan_x + W, pan_y + H))
        
        # Cinematic desaturation + warm grade
        img = ImageEnhance.Color(img).enhance(0.25)
        img = ImageEnhance.Contrast(img).enhance(1.3)
        img = color_grade(img, warmth=1.15, saturation=0.4)
        
        # Slow brightness reveal
        brightness = 0.3 + 0.7 * min(1.0, t / 0.8)
        img = ImageEnhance.Brightness(img).enhance(brightness)
        
        img = scanlines(img, 30)
        img = vignette(img, 0.75)
        
        # Fade from black
        if t < 0.4:
            fade = t / 0.4
            black = Image.new("RGB", (W, H), BLACK)
            img = Image.blend(black, img, fade)
        
        # "EST. 2026" appears bottom center
        if t > 0.6:
            text_fade = min(1.0, (t - 0.6) / 0.3)
            draw = ImageDraw.Draw(img)
            est = "E S T .   2 0 2 6"
            bbox = draw.textbbox((0,0), est, font=FONT_AVENIR_SM)
            tw = bbox[2] - bbox[0]
            alpha_c = tuple(int(c * text_fade) for c in GOLD)
            outlined_text(draw, ((W-tw)//2, H - 80), est, FONT_AVENIR_SM, fill=alpha_c, outline=BLACK, ow=2)

    # ─── PHASE 2: Full-bleed NFT showcase (1.2–3.5s) ───
    elif t < 3.5:
        img = nft_filled[nft_idx].copy()
        
        # Ken Burns — subtle zoom filling entire frame
        phase_p = (t - 1.2) / 2.3
        img = ken_burns_fill(nft_images[nft_idx], W, H, phase_p, 1.0, 1.10)
        
        # Color grade for punch
        img = color_grade(img, warmth=1.05, saturation=1.3)
        img = ImageEnhance.Contrast(img).enhance(1.15)
        
        # Beat-synced effects
        if is_beat:
            img = glitch(img, 35 + int(progress * 40))
            img = rgb_shift(img, 10 + int(progress * 18))
            # Hot flash — tinted, not white
            flash_color = random.choice([NEON_PINK, NEON_CYAN, GOLD])
            flash = Image.new("RGB", (W, H), flash_color)
            img = Image.blend(img, flash, 0.12)
        
        img = scanlines(img, 20)
        img = vignette(img, 0.35)
        
        # Bottom gradient bar for text readability
        gradient = Image.new("RGBA", (W, 200), (0, 0, 0, 0))
        for y in range(200):
            alpha = int(200 * (y / 200) ** 1.5)
            for x in range(W):
                gradient.putpixel((x, y), (0, 0, 0, alpha))
        img_rgba = img.convert("RGBA")
        img_rgba.paste(gradient, (0, H - 200), gradient)
        img = img_rgba.convert("RGB")
        
        draw = ImageDraw.Draw(img)
        
        # "THE UNDESIRABLES" — large, cinematic
        title = "THE UNDESIRABLES"
        bbox = draw.textbbox((0,0), title, font=FONT_DIDOT_MD)
        tw = bbox[2] - bbox[0]
        outlined_text(draw, ((W-tw)//2, H - 145), title, FONT_DIDOT_MD, fill=WHITE, outline=BLACK, ow=4)
        
        # Subtitle
        sub = "4,444 SOULS ON BASE"
        bbox2 = draw.textbbox((0,0), sub, font=FONT_AVENIR_SM)
        tw2 = bbox2[2] - bbox2[0]
        outlined_text(draw, ((W-tw2)//2, H - 90), sub, FONT_AVENIR_SM, fill=GOLD, outline=BLACK, ow=2)

    # ─── PHASE 3: Double-exposure chaos (3.5–4.3s) ───
    elif t < 4.3:
        n1 = nft_filled[nft_idx]
        n2 = nft_filled[(nft_idx + 5) % len(nft_filled)]
        n3 = nft_filled[(nft_idx + 10) % len(nft_filled)]
        
        # Triple blend for max chaos
        img = Image.blend(n1, n2, 0.4)
        img = Image.blend(img, n3, 0.2)
        
        # Heavy FX
        img = glitch(img, 55)
        img = rgb_shift(img, 22)
        img = ImageEnhance.Contrast(img).enhance(1.4)
        
        # Strobe
        if int(t * 20) % 3 == 0:
            flash = Image.new("RGB", (W, H), NEON_PINK)
            img = Image.blend(img, flash, 0.15)
        
        img = scanlines(img, 35)
        img = vignette(img, 0.5)
        
        # "BORN UNDESIRABLE" centered
        draw = ImageDraw.Draw(img)
        slam = "BORN"
        slam2 = "UNDESIRABLE"
        
        bbox = draw.textbbox((0,0), slam, font=FONT_IMPACT_LG)
        tw = bbox[2] - bbox[0]
        outlined_text(draw, ((W-tw)//2, H//2 - 60), slam, FONT_IMPACT_LG, fill=NEON_PINK, outline=BLACK, ow=5)
        
        bbox2 = draw.textbbox((0,0), slam2, font=FONT_IMPACT_SM)
        tw2 = bbox2[2] - bbox2[0]
        outlined_text(draw, ((W-tw2)//2, H//2 + 15), slam2, FONT_IMPACT_SM, fill=WHITE, outline=BLACK, ow=3)

    # ─── PHASE 4: Brand card (4.3–5.0s) ───
    else:
        # Tiled background — 3×4 grid of darkened NFTs filling the entire frame
        cols, rows = 3, 4
        cell_w = W // cols
        cell_h = H // rows
        
        img = Image.new("RGB", (W, H), BLACK)
        for r in range(rows):
            for c in range(cols):
                idx = (nft_idx + r * cols + c) % len(nft_filled)
                mini = nft_images[idx].resize((cell_w, cell_h), Image.LANCZOS)
                img.paste(mini, (c * cell_w, r * cell_h))
        
        # Dark overlay so text pops
        img = ImageEnhance.Brightness(img).enhance(0.25)
        img = ImageEnhance.Color(img).enhance(0.3)
        img = vignette(img, 0.9)
        
        # Gaussian blur for depth
        img = img.filter(ImageFilter.GaussianBlur(radius=4))
        
        draw = ImageDraw.Draw(img)
        
        # Central branding block
        brand = "UNDESIRABLES"
        bbox = draw.textbbox((0,0), brand, font=FONT_DIDOT_LG)
        tw = bbox[2] - bbox[0]
        outlined_text(draw, ((W-tw)//2, H//2 - 70), brand, FONT_DIDOT_LG, fill=WHITE, outline=BLACK, ow=4)
        
        # Divider line
        line_w = 200
        line_y = H//2 - 5
        draw.rectangle([(W-line_w)//2, line_y, (W+line_w)//2, line_y+2], fill=GOLD)
        
        tagline = "TCG ORACLE"
        bbox2 = draw.textbbox((0,0), tagline, font=FONT_AVENIR_MD)
        tw2 = bbox2[2] - bbox2[0]
        outlined_text(draw, ((W-tw2)//2, H//2 + 15), tagline, FONT_AVENIR_MD, fill=GOLD, outline=BLACK, ow=2)
        
        sub = "CARD GRADING & MARKET INTELLIGENCE"
        bbox3 = draw.textbbox((0,0), sub, font=FONT_AVENIR_SM)
        tw3 = bbox3[2] - bbox3[0]
        outlined_text(draw, ((W-tw3)//2, H//2 + 55), sub, FONT_AVENIR_SM, fill=NEON_CYAN, outline=BLACK, ow=2)
        
        # Fade to black for clean transition into demo
        fade_out = max(0, (t - 4.75) / 0.25)
        if fade_out > 0:
            black = Image.new("RGB", (W, H), BLACK)
            img = Image.blend(img, black, min(1.0, fade_out))

    img.save(os.path.join(FRAME_DIR, f"{f:06d}.jpg"), quality=95)
    if f % 50 == 0:
        print(f"  Frame {f}/{TOTAL_FRAMES} ({t:.1f}s)")

print(f"\n✓ All {TOTAL_FRAMES} frames rendered!")

# ─── ASSEMBLE ───
print("\n▸ Assembling intro...")
os.system(f'''ffmpeg -y -framerate {FPS} -i "{FRAME_DIR}/%06d.jpg" \
  -vf "format=yuv420p" \
  -color_range tv -colorspace bt709 -color_trc bt709 -color_primaries bt709 \
  -c:v libx264 -crf 18 -preset medium -movflags +faststart \
  -t {DURATION} "{OUTPUT}"''')

print(f"✓ Intro: {OUTPUT}")

# ─── CONCAT WITH DEMO ───
print("\n▸ Concatenating intro + demo...")
os.system(f'''ffmpeg -y \
  -i "{OUTPUT}" -i "{DEMO_VIDEO}" \
  -filter_complex "[0:v]scale={W}:{H},setsar=1,fps={FPS}[v0]; \
                   [1:v]scale={W}:{H},setsar=1,fps={FPS}[v1]; \
                   [v0][v1]concat=n=2:v=1:a=0[outv]; \
                   [1:a]adelay=5000|5000[outa]" \
  -map "[outv]" -map "[outa]" \
  -c:v libx264 -crf 20 -preset medium \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  "{FINAL_OUTPUT}"''')

if os.path.exists(FINAL_OUTPUT):
    size_mb = os.path.getsize(FINAL_OUTPUT) / (1024*1024)
    print(f"\n{'='*50}")
    print(f"  ✓ FINAL: {FINAL_OUTPUT}")
    print(f"  Size: {size_mb:.1f} MB")
    print(f"{'='*50}")
