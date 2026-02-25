"""
Quick test for the extraction pipeline.
Run: python test_extractor.py <path_to_form.pdf_or_image>
"""
import sys
import json
import os
from dotenv import load_dotenv

load_dotenv()

def test_extraction(file_path: str):
    from extractor import FormExtractor
    
    print(f"\n{'='*60}")
    print(f"Testing extraction: {file_path}")
    print('='*60)
    
    extractor = FormExtractor()
    result = extractor.extract(file_path)
    
    print(f"\n✅ Source type:  {result.source_type}")
    print(f"✅ Form title:   {result.form_title}")
    print(f"✅ Page count:   {result.page_count}")
    print(f"✅ Fields found: {len(result.fields)}")
    print(f"✅ Warnings:     {len(result.warnings)}")
    
    if result.warnings:
        for w in result.warnings:
            print(f"   ⚠️  {w}")
    
    print(f"\n{'─'*60}")
    print("EXTRACTED FIELDS:")
    print('─'*60)
    
    for i, f in enumerate(result.fields):
        if isinstance(f, dict):
            name = f.get('field_name')
            label = f.get('semantic_label')
            ftype = f.get('field_type')
            required = f.get('is_required')
            question = f.get('question_template')
        else:
            name = f.field_name
            label = f.semantic_label
            ftype = f.field_type
            required = f.is_required
            question = f.question_template
        
        req_mark = "* " if required else "  "
        print(f"{req_mark}{i+1:2}. [{ftype:10}] {label}")
        print(f"       Q: {question}")
        print()
    
    # Save result to JSON
    out_path = "extraction_result.json"
    result_dict = result.to_dict()
    result_dict.pop("raw_image_b64", None)  # Don't save huge base64 to terminal
    with open(out_path, "w") as f_out:
        json.dump(result_dict, f_out, indent=2)
    print(f"\n💾 Full result saved to: {out_path}")
    print('='*60)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_extractor.py <form.pdf|form.png|form.jpg>")
        sys.exit(1)
    
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("❌ ANTHROPIC_API_KEY not set. Check your .env file.")
        sys.exit(1)
    
    test_extraction(sys.argv[1])
