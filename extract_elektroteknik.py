#!/usr/bin/env python3
"""
Extract complete study content from all 8 Elektroteknik PDFs.
Produces ELEKTROTEKNIK-8-BOOKS-STUDY.md with formulas, worked examples,
calculation procedures, symbols, and reference tables from each book.
"""

import fitz  # PyMuPDF
import re
import os
from datetime import datetime

# PDF files in priority order
BOOKS = [
    {
        "number": 5,
        "path": "Forsyningsnet_og_transformerstationer (bog 5).pdf",
        "title": "Forsyningsnet og transformerstationer",
        "priority": 1,
        "description": "Power supply networks and transformer stations - directly relevant to Opgave 1"
    },
    {
        "number": 8,
        "path": "El-8.pdf",
        "title": "El-installationsmateriel (Distribution og installation)",
        "priority": 2,
        "description": "Electrical installation materials - directly relevant to Opgave 2"
    },
    {
        "number": 3,
        "path": "El-3.pdf",
        "title": "Elektriske maskiner (Vekselstromsteori)",
        "priority": 3,
        "description": "Electrical machines - largest Opgavesamling chapter"
    },
    {
        "number": 6,
        "path": "El-6.pdf",
        "title": "El-tekniske beregninger",
        "priority": 4,
        "description": "Short-circuit, voltage drop, selectivity calculations"
    },
    {
        "number": 1,
        "path": "El-1.pdf",
        "title": "Elektricitet og magnetisme (Grundbegreber)",
        "priority": 5,
        "description": "Electricity and magnetism fundamentals"
    },
    {
        "number": 2,
        "path": "El-2.pdf",
        "title": "Elektriske malinger (Jaevnstromskredsloeb)",
        "priority": 6,
        "description": "Electrical measurements and DC circuits"
    },
    {
        "number": 4,
        "path": "El-4.pdf",
        "title": "Lys og varme + Maleinstrumenter",
        "priority": 7,
        "description": "Light and heat + measuring instruments"
    },
    {
        "number": 7,
        "path": "El-7.pdf",
        "title": "Elektriske installationer (Beskyttelse)",
        "priority": 8,
        "description": "Electrical installations and protection"
    },
]

# Watermark/copyright patterns to strip
WATERMARK_PATTERNS = [
    r"Dette eksemplar er fremstillet af Nota.*",
    r"Denne udgave er produceret af Studiebogservice.*",
    r"Dette eksemplar er fremstillet af Nota til Shahram Ajloo og m.*deles",
    r"m\s*å\s*ikke\s*deles",
]

# Patterns to identify formulas
FORMULA_INDICATORS = [
    r'[A-Za-z_]\s*=\s*[A-Za-z0-9\.\,\(\)\*\/\+\-\^]+',  # Variable = expression
    r'\d+[\.,]\d+\s*[A-Za-z]+',  # Numbers with units
    r'[UIRPQSZWV]\s*[=<>]',  # Common electrical variables
    r'cos\s*[φϕ\(]',  # Power factor
    r'sin\s*[φϕ\(]',
    r'tan\s*[δ\(]',
    r'√|∛',  # Root symbols
    r'[Ω²³]',  # Special chars
    r'[×·]',  # Multiplication
    r'\bkW\b|\bkVA\b|\bkVAr\b|\bMVA\b|\bMW\b',
    r'\bmm²\b|\bm²\b',
    r'\b[A-Z][a-z]?\s*=\s*\d',  # Variable = number
]

# Patterns to identify worked examples
EXAMPLE_PATTERNS = [
    r'^Eks[\.:]\s*',
    r'^Eksempel\s*\d*[\.:]*',
    r'^Beregningseksempel\s*\d*[\.:]*',
    r'^Regneeksempel\s*\d*[\.:]*',
    r'^Opgave\s*\d+[\.:]*',
    r'^Losning[\.:]*',
    r'^Beregning[\.:]*',
    r'^Losningsforslag[\.:]*',
]

# Patterns to identify chapter headings
HEADING_PATTERNS = [
    r'^Kapitel\s+\d+',
    r'^Kap\.\s*\d+',
    r'^\d+\.\s+[A-ZÆØÅ]',
    r'^\d+\.\d+\s+[A-ZÆØÅ]',
    r'^[A-ZÆØÅ][A-ZÆØÅ\s]+$',  # ALL CAPS lines (headings)
]

# Table indicators
TABLE_INDICATORS = [
    r'^Tabel\s+\d+',
    r'^\s*\|',
    r'\t.*\t',  # Tab-separated
    r'^\s*[\d,\.]+\s+[\d,\.]+\s+[\d,\.]+',  # Number columns
]


def strip_watermarks(text):
    """Remove watermark/copyright lines from extracted text."""
    lines = text.split('\n')
    cleaned = []
    for line in lines:
        skip = False
        for pattern in WATERMARK_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                skip = True
                break
        if not skip:
            cleaned.append(line)
    return '\n'.join(cleaned)


def is_formula_line(line):
    """Check if a line likely contains a formula."""
    line = line.strip()
    if len(line) < 3:
        return False
    for pattern in FORMULA_INDICATORS:
        if re.search(pattern, line):
            return True
    return False


def is_example_start(line):
    """Check if a line starts a worked example."""
    line = line.strip()
    for pattern in EXAMPLE_PATTERNS:
        if re.search(pattern, line, re.IGNORECASE):
            return True
    return False


def is_heading(line):
    """Check if a line is likely a chapter/section heading."""
    line = line.strip()
    if len(line) < 3 or len(line) > 120:
        return False
    for pattern in HEADING_PATTERNS:
        if re.search(pattern, line):
            return True
    return False


def is_table_content(line):
    """Check if a line is likely part of a table."""
    line = line.strip()
    for pattern in TABLE_INDICATORS:
        if re.search(pattern, line):
            return True
    return False


def extract_toc(pages_text, max_pages=30):
    """Try to extract table of contents from first pages."""
    toc_lines = []
    in_toc = False
    
    for page_num, text in enumerate(pages_text[:max_pages]):
        lines = text.split('\n')
        for line in lines:
            stripped = line.strip()
            # TOC indicators
            if re.search(r'(?i)indholdsfortegnelse|indhold|contents', stripped):
                in_toc = True
                toc_lines.append(stripped)
                continue
            if in_toc:
                # TOC entries typically have page numbers or dots
                if re.search(r'\d+\s*$', stripped) or re.search(r'\.{2,}', stripped):
                    toc_lines.append(stripped)
                elif re.search(r'^\d+[\.\s]', stripped):
                    toc_lines.append(stripped)
                elif stripped == '' and toc_lines:
                    # End of TOC if we hit empty lines after content
                    pass
                elif re.search(r'^(Kapitel|Kap|Afsnit)\s+\d', stripped):
                    toc_lines.append(stripped)
                elif len(stripped) > 3 and not re.search(r'^Side\s+\d', stripped):
                    # Could still be TOC
                    if any(c.isalpha() for c in stripped):
                        toc_lines.append(stripped)
            # If page starts with "Side" marker and we haven't found TOC, keep looking
            if re.search(r'^Side\s+\d', stripped) and page_num > 15:
                in_toc = False
    
    return toc_lines


def extract_book_content(pdf_path, book_info):
    """Extract all relevant content from a single PDF."""
    print(f"  Processing Book {book_info['number']}: {book_info['title']} ({pdf_path})...")
    
    doc = fitz.open(pdf_path)
    num_pages = len(doc)
    print(f"    Pages: {num_pages}")
    
    # Extract all pages text
    pages_text = []
    for page_num in range(num_pages):
        page = doc[page_num]
        text = page.get_text()
        text = strip_watermarks(text)
        pages_text.append(text)
    
    doc.close()
    
    # Extract TOC
    toc = extract_toc(pages_text)
    
    # Extract content categorized
    formulas = []
    examples = []
    tables = []
    headings = []
    procedures = []
    symbols = []
    
    # Full content extraction with context
    all_content = []
    current_chapter = "Introduktion"
    in_example = False
    example_buffer = []
    example_start_page = 0
    
    # Track formula context
    formula_buffer = []
    in_formula_block = False
    
    for page_idx, text in enumerate(pages_text):
        lines = text.split('\n')
        page_num = page_idx + 1
        
        for line_idx, line in enumerate(lines):
            stripped = line.strip()
            
            if not stripped:
                if in_example and example_buffer:
                    # Empty line might end example or be paragraph break
                    example_buffer.append('')
                if in_formula_block and formula_buffer:
                    in_formula_block = False
                    formulas.append({
                        'page': page_num,
                        'chapter': current_chapter,
                        'content': '\n'.join(formula_buffer)
                    })
                    formula_buffer = []
                continue
            
            # Check for headings
            if is_heading(stripped):
                current_chapter = stripped
                headings.append({'page': page_num, 'text': stripped})
                
                # End any open example
                if in_example and example_buffer:
                    examples.append({
                        'page': example_start_page,
                        'chapter': current_chapter,
                        'content': '\n'.join(example_buffer)
                    })
                    example_buffer = []
                    in_example = False
                continue
            
            # Check for example start
            if is_example_start(stripped):
                # Save previous example if any
                if in_example and example_buffer:
                    examples.append({
                        'page': example_start_page,
                        'chapter': current_chapter,
                        'content': '\n'.join(example_buffer)
                    })
                
                in_example = True
                example_buffer = [stripped]
                example_start_page = page_num
                continue
            
            # If in example, collect lines
            if in_example:
                example_buffer.append(stripped)
                # End example if we hit a new section or have collected enough
                if len(example_buffer) > 200:
                    # Very long example - keep collecting but check for natural end
                    pass
                continue
            
            # Check for formulas
            if is_formula_line(stripped):
                if in_formula_block:
                    formula_buffer.append(stripped)
                else:
                    in_formula_block = True
                    formula_buffer = [stripped]
                    # Look back for context (previous non-empty line)
                    if line_idx > 0:
                        prev = lines[line_idx - 1].strip() if line_idx > 0 else ''
                        if prev and not is_formula_line(prev):
                            formula_buffer.insert(0, f"[Context: {prev}]")
                continue
            
            # Check for table content
            if is_table_content(stripped):
                tables.append({'page': page_num, 'chapter': current_chapter, 'line': stripped})
                continue
            
            # Check for procedure/algorithm descriptions
            if re.search(r'(?i)(beregn|find|bestem|udregn|kontroller|check)', stripped):
                if re.search(r'(?i)(forst|derefter|herefter|til sidst|trin\s*\d|punkt\s*\d|step)', stripped):
                    procedures.append({'page': page_num, 'chapter': current_chapter, 'text': stripped})
    
    # Save last example if open
    if in_example and example_buffer:
        examples.append({
            'page': example_start_page,
            'chapter': current_chapter,
            'content': '\n'.join(example_buffer)
        })
    
    # Save last formula block if open
    if formula_buffer:
        formulas.append({
            'page': page_num,
            'chapter': current_chapter,
            'content': '\n'.join(formula_buffer)
        })
    
    print(f"    Found: {len(formulas)} formula blocks, {len(examples)} examples, {len(headings)} headings")
    
    return {
        'toc': toc,
        'formulas': formulas,
        'examples': examples,
        'tables': tables,
        'headings': headings,
        'procedures': procedures,
        'num_pages': num_pages,
        'pages_text': pages_text,
    }


def extract_full_page_content(pages_text, start_page=6):
    """Extract full content from all pages, preserving structure."""
    content_blocks = []
    current_section = ""
    
    for page_idx in range(start_page, len(pages_text)):
        text = pages_text[page_idx].strip()
        if not text:
            continue
        
        lines = text.split('\n')
        page_content = []
        
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            # Skip pure page number lines
            if re.match(r'^Side\s+\d+\s*$', stripped):
                continue
            if re.match(r'^\d+\s*$', stripped) and len(stripped) < 5:
                continue
            page_content.append(stripped)
        
        if page_content:
            content_blocks.append({
                'page': page_idx + 1,
                'lines': page_content
            })
    
    return content_blocks


def format_book_section(book_info, extracted):
    """Format extracted content for one book into markdown sections."""
    sections = []
    
    # Header
    sections.append(f"## Bind {book_info['number']}: {book_info['title']} (Prioritet {book_info['priority']})")
    sections.append(f"")
    sections.append(f"**Beskrivelse:** {book_info['description']}")
    sections.append(f"**Sider:** {extracted['num_pages']}")
    sections.append(f"")
    
    # Chapter Structure / TOC
    sections.append(f"### Kapitelstruktur / Indholdsfortegnelse")
    sections.append(f"")
    if extracted['toc']:
        for line in extracted['toc']:
            sections.append(f"- {line}")
    else:
        # Use headings as fallback
        for h in extracted['headings'][:50]:
            sections.append(f"- Side {h['page']}: {h['text']}")
    sections.append(f"")
    
    # Key Formulas
    sections.append(f"### Formler (Key Formulas)")
    sections.append(f"")
    sections.append(f"*Antal fundne formelblokke: {len(extracted['formulas'])}*")
    sections.append(f"")
    
    for i, formula in enumerate(extracted['formulas']):
        sections.append(f"**Formel {i+1}** (Side {formula['page']}, {formula['chapter']}):")
        sections.append(f"```")
        sections.append(formula['content'])
        sections.append(f"```")
        sections.append(f"")
    
    # Worked Examples
    sections.append(f"### Beregningseksempler (Worked Examples)")
    sections.append(f"")
    sections.append(f"*Antal fundne eksempler: {len(extracted['examples'])}*")
    sections.append(f"")
    
    for i, example in enumerate(extracted['examples']):
        sections.append(f"#### Eksempel {i+1} (Side {example['page']}, {example['chapter']})")
        sections.append(f"")
        sections.append(f"```")
        sections.append(example['content'])
        sections.append(f"```")
        sections.append(f"")
    
    # Calculation Procedures
    sections.append(f"### Beregningsprocedurer (Calculation Procedures)")
    sections.append(f"")
    if extracted['procedures']:
        for proc in extracted['procedures']:
            sections.append(f"- (Side {proc['page']}) {proc['text']}")
    else:
        sections.append(f"*Ingen eksplicitte procedurer identificeret - se beregningseksempler ovenfor.*")
    sections.append(f"")
    
    # Reference Tables
    sections.append(f"### Referencetabeller (Reference Tables)")
    sections.append(f"")
    if extracted['tables']:
        current_chapter = ""
        for table in extracted['tables'][:100]:  # Limit output
            if table['chapter'] != current_chapter:
                current_chapter = table['chapter']
                sections.append(f"**{current_chapter}:**")
            sections.append(f"  {table['line']}")
    else:
        sections.append(f"*Tabeller integreret i formler og eksempler ovenfor.*")
    sections.append(f"")
    
    # Full Content Extract (detailed pages)
    sections.append(f"### Komplet Indhold (Full Content Extract)")
    sections.append(f"")
    
    content_blocks = extract_full_page_content(extracted['pages_text'])
    for block in content_blocks:
        sections.append(f"**--- Side {block['page']} ---**")
        for line in block['lines']:
            sections.append(line)
        sections.append(f"")
    
    return '\n'.join(sections)


def main():
    base_dir = "/projects/sandbox/Claude"
    output_path = os.path.join(base_dir, "ELEKTROTEKNIK-8-BOOKS-STUDY.md")
    
    print("=" * 70)
    print("ELEKTROTEKNIK 8-Books Study Extraction")
    print("=" * 70)
    
    # Build output
    output = []
    output.append("# ELEKTROTEKNIK 8-Books Complete Study")
    output.append("")
    output.append(f"*Genereret: {datetime.now().strftime('%Y-%m-%d %H:%M')}*")
    output.append("")
    output.append("## Oversigt (Summary)")
    output.append("")
    output.append("Dette dokument indeholder komplet studieindhold fra alle 8 bind af Elektroteknik-serien.")
    output.append("Indholdet er organiseret efter eksamensrelevans (prioritet).")
    output.append("")
    output.append("### Prioritetsraekkefolge:")
    output.append("")
    for book in BOOKS:
        output.append(f"{book['priority']}. **Bind {book['number']}**: {book['title']} - {book['description']}")
    output.append("")
    output.append("### Indholdsstruktur pr. bog:")
    output.append("")
    output.append("- Kapitelstruktur / Indholdsfortegnelse")
    output.append("- Formler (Key Formulas) med danske variabelnavne")
    output.append("- Beregningseksempler (Worked Examples) med trin-for-trin losninger")
    output.append("- Beregningsprocedurer (Calculation Procedures)")
    output.append("- Referencetabeller (Reference Tables)")
    output.append("- Komplet Indhold (Full Content Extract)")
    output.append("")
    output.append("---")
    output.append("")
    
    # Process each book
    for book in BOOKS:
        pdf_path = os.path.join(base_dir, book['path'])
        
        if not os.path.exists(pdf_path):
            print(f"  WARNING: {pdf_path} not found!")
            output.append(f"## Bind {book['number']}: {book['title']}")
            output.append(f"")
            output.append(f"**FEJL: PDF-fil ikke fundet: {book['path']}**")
            output.append(f"")
            continue
        
        print(f"\nProcessing Book {book['number']} (Priority {book['priority']})...")
        extracted = extract_book_content(pdf_path, book)
        
        book_section = format_book_section(book, extracted)
        output.append(book_section)
        output.append("")
        output.append("---")
        output.append("")
        
        # Free memory
        del extracted['pages_text']
        
        print(f"  Done with Book {book['number']}")
    
    # Write output
    print(f"\nWriting output to {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(output))
    
    file_size = os.path.getsize(output_path)
    print(f"Output written: {file_size:,} bytes ({file_size/1024/1024:.1f} MB)")
    print("Done!")


if __name__ == "__main__":
    main()
