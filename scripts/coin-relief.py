# Strikes the mascot (public/mascot.jpg) into a coin: builds a height map from its colour regions
# (the field, the sticker edge, the face, the mouth, the sprout, and the raised ink lines), bevels
# it, lights it from the top left as a frosted portrait on a polished gold field, and writes the
# two faces the loader draws inside the coin's inner ring:
#   public/coin/face-lit.png   the struck coin
#   public/coin/face-dim.png   the same design as thin unlit lines (the coin before it fills)
# Run once with: python3 scripts/coin-relief.py
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = 'public/mascot.jpg'
OUT = 512            # output size, px (the disc fills it)
FIT = 0.80           # the mascot's share of the disc diameter

im = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
black = (r < 90) & (g < 90) & (b < 90)
yellow = (r > 190) & (g > 140) & (b < 110) & ~black
pink = (r > 190) & (g > 110) & (g < 205) & (b > 110) & (b < 205) & ~yellow
green = (g > 110) & (g > r + 15) & (g > b + 15) & ~black
white = ~(black | yellow | pink | green)

# the white sticker edge touches the yellow; the face whites are shut in by the ink lines
labels, n = ndi.label(white)
touch = np.unique(labels[ndi.binary_dilation(yellow, iterations=3) & white])
halo = np.isin(labels, touch[touch > 0])
face = white & ~halo

h = np.zeros_like(r)
h[halo] = 0.30
h[face] = 0.62
h[green] = 0.72
h[pink] = 0.78
h[black] = 1.0

# scale onto the disc, centred on the figure
figure = ~yellow
ys, xs = np.nonzero(figure)
cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
span = max(ys.max() - ys.min(), xs.max() - xs.min())
scale = OUT * FIT / span
zoom = lambda a, order: ndi.zoom(a, scale, order=order)
H = zoom(h, 1)
F = zoom(figure.astype(float), 1) > 0.5
def place(a, fill):
    out = np.full((OUT, OUT), fill, dtype=a.dtype)
    oy, ox = int(round(OUT / 2 - cy * scale)), int(round(OUT / 2 - cx * scale))
    y0, x0 = max(0, oy), max(0, ox); y1, x1 = min(OUT, oy + a.shape[0]), min(OUT, ox + a.shape[1])
    out[y0:y1, x0:x1] = a[y0 - oy:y1 - oy, x0 - ox:x1 - ox]
    return out
H = place(H, 0.0)
F = place(F, False)

# bevels, and the lighting
H = ndi.gaussian_filter(H, 1.25)
gy, gx = np.gradient(H)
k = 13.0
nz = 1 / np.sqrt(1 + (k * gx) ** 2 + (k * gy) ** 2)
nx, ny = -k * gx * nz, -k * gy * nz
L = np.array([-0.55, -0.65, 0.52]); L /= np.linalg.norm(L)
Hv = L + np.array([0, 0, 1]); Hv /= np.linalg.norm(Hv)
diff = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
spec = np.clip(nx * Hv[0] + ny * Hv[1] + nz * Hv[2], 0, 1)
cavity = np.clip((ndi.gaussian_filter(H, 7) - H) * 2.2, 0, 1)

yy, xx = np.mgrid[0:OUT, 0:OUT]
u, v = (xx - OUT / 2) / (OUT / 2), (yy - OUT / 2) / (OUT / 2)
rad = np.hypot(u, v)
disc = np.clip((1 - rad) * (OUT / 2) + 0.5, 0, 1)   # anti-aliased edge

# the field: polished, a mirror sheen that runs from the top left
field = np.array([0.82, 0.62, 0.30])
sheen = np.clip(0.5 - 0.5 * (u * 0.7 + v * 0.7), 0, 1) ** 1.6
frosted = np.array([1.0, 0.93, 0.74])
base = np.where(F[..., None], frosted, field)
lit = base * (0.42 + 0.72 * diff)[..., None]
lit += (np.where(F, spec ** 14 * 0.30, spec ** 50 * 0.9 + sheen * 0.30))[..., None] * np.array([1.0, 0.97, 0.88])
lit -= (cavity * 0.5)[..., None]
lit = np.clip(lit, 0, 1)

Image.fromarray((np.dstack([lit, disc[..., None]]) * 255).astype(np.uint8), 'RGBA').save('public/coin/face-lit.png', optimize=True)

# hollow: the relief's edges as thin lines in the loader's dim light
edge = np.clip(np.hypot(gx, gy) * 7.0, 0, 1) * disc
dim = np.array([1.0, 0.89, 0.68])
Image.fromarray((np.dstack([np.broadcast_to(dim, (OUT, OUT, 3)), (edge * 0.75)[..., None]]) * 255).astype(np.uint8), 'RGBA').save('public/coin/face-dim.png', optimize=True)
print('ok', n, 'white parts,', int(halo.sum()), 'halo px')
