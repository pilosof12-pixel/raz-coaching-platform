from pathlib import Path

# Keep Youth support strength clearly submaximal relative to the documented 6-rep ring-dip ceiling.
gf = Path('phase14/test/fixtures/golden_programs.js')
s = gf.read_text()
s = s.replace("const ring = ['5', '6', '7', '6-7'][week - 1];", "const ring = ['4', '4', '4', '4'][week - 1];")
gf.write_text(s)
