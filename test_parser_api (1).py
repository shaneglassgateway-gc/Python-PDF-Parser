#!/usr/bin/env python3
"""
Debug script to test EagleView parser output format.
Run this to see exactly what your API should receive.
"""
import sys
import json
from eagleview_parser import EagleViewParser

def test_parse(pdf_path):
    try:
        parser = EagleViewParser(pdf_path)
        report = parser.parse()
        data = parser.to_dict(report)
        
        print("=" * 60)
        print("PARSER OUTPUT STRUCTURE")
        print("=" * 60)
        
        # Check structures
        structures = data.get('structures', [])
        print(f"\nStructures found: {len(structures)}")
        
        if structures:
            print("\n--- STRUCTURE ACCESS PATHS ---")
            s1 = structures[0]
            print(f"Structure 1 area:    data.structures[0].total_area_sqft = {s1['total_area_sqft']}")
            print(f"Structure 1 pitch:   data.structures[0].predominant_pitch = {s1['predominant_pitch']}")
            print(f"Structure 1 ridges:  data.structures[0].measurements.ridges_ft = {s1['measurements']['ridges_ft']}")
            print(f"Structure 1 rakes:   data.structures[0].measurements.rakes_ft = {s1['measurements']['rakes_ft']}")
            print(f"Structure 1 eaves:   data.structures[0].measurements.eaves_ft = {s1['measurements']['eaves_ft']}")
            print(f"Structure 1 squares: data.structures[0].suggested_waste.squares = {s1['suggested_waste']['squares'] if s1.get('suggested_waste') else 'N/A'}")
            
            if len(structures) > 1:
                s2 = structures[1]
                print(f"\nStructure 2 area:    data.structures[1].total_area_sqft = {s2['total_area_sqft']}")
                print(f"Structure 2 squares: data.structures[1].suggested_waste.squares = {s2['suggested_waste']['squares'] if s2.get('suggested_waste') else 'N/A'}")
        
        print("\n--- COMBINED TOTALS (top-level) ---")
        roof = data.get('roof_measurements', {})
        print(f"Total area:   data.roof_measurements.total_area_sqft = {roof.get('total_area_sqft')}")
        print(f"Total ridges: data.roof_measurements.ridges_ft = {roof.get('ridges_ft')}")
        
        # Output full JSON
        print("\n" + "=" * 60)
        print("FULL JSON OUTPUT")
        print("=" * 60)
        print(json.dumps(data, indent=2))
        
        return data
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_parser_api.py <pdf_path>")
        sys.exit(1)
    test_parse(sys.argv[1])
