"""
_1_read.py - extract the text from the PDF.
Usage: 
    python _1_read.py document.pdf
"""

import sys
from pypdf import PdfReader

def read_pdf(path: str) -> str:
    """Extract all text from a PDF into one big string."""
    reader = PdfReader(path)
    pages_text = []

    for page_num, page in enumerate(reader.pages):
        text = page.extract_text()
        pages_text.append(text)
        print(f"Page {page_num + 1}: extracted {len(text)} characters")

    full_text = "\n\n".join(pages_text)
    print(f"Total {len(full_text)} characters across {len(reader.pages)} pages ")
    return full_text

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python _1_read.py document.pdf")
        sys.exit(1)
    
    text = read_pdf(sys.argv[1])

    # Print the first 500 characters as a sanity check
    print("\n---- First 500 characters ---")
    print(text[:500])