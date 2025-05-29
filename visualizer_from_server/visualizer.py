from PIL import Image

PALETTE = {
    0x0: (0, 0, 0),         # Black
    0x1: (255, 255, 255),   # White
    0x2: (0, 255, 0),       # Green
    0x3: (0, 0, 255),       # Blue
    0x4: (255, 0, 0),       # Red
    0x5: (255, 255, 0),     # Yellow
    0x6: (255, 165, 0),     # Orange
}

def convert_pixel(value):
    """Convert a pixel to rgb color."""
    if value == 0x7:
        return PALETTE[0x0]  # Clean -> black
    return PALETTE.get(value, (0, 0, 0))  # Default to black if not found

def load_image(filepath, width=600, height=448):
    with open(filepath, "rb") as f:
        data = f.read()

    expected_size = (width * height) // 2
    if len(data) != expected_size:
        raise ValueError(f"Incorrect size. Expected: {expected_size}, received: {len(data)}")

    # Creates a new rgb color image
    img = Image.new("RGB", (width, height))
    pixels = img.load()

    i = 0  # byte index
    for y in range(height):
        for x in range(0, width, 2):
            byte = data[i]
            high = (byte & 0xF0) >> 4
            low = byte & 0x0F
            pixels[x, y] = convert_pixel(high)
            pixels[x+1, y] = convert_pixel(low)
            i += 1

    return img

# Example usage
if __name__ == "__main__":
    img = load_image("image.bin")
    img.show()              # Show the image
    img.save("output.png")  # Save the image as PNG
