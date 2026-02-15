"""Image preprocessing for OCR using Pillow."""

from PIL import Image, ImageFilter, ImageOps
import io


def preprocess_image(image_data: bytes) -> bytes:
    """Preprocess image for optimal OCR results.

    Steps: grayscale -> normalize contrast -> sharpen -> binarize
    """
    try:
        image = Image.open(io.BytesIO(image_data))

        # Convert to grayscale
        image = ImageOps.grayscale(image)

        # Auto contrast (normalize)
        image = ImageOps.autocontrast(image)

        # Sharpen
        image = image.filter(ImageFilter.SHARPEN)

        # Binarize (simple threshold)
        image = image.point(lambda x: 255 if x > 128 else 0)

        # Save to buffer
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()
    except Exception:
        # Return original if preprocessing fails
        return image_data
