# Reference suitability — gacha-machine-ref.png

Verdict: **conditional → proceed (stylized)**.

Pass criteria met: one obvious target object; object fills ~85% of the frame; strong silhouette
(sphere on rounded cuboid, medallion on top); all major materials visible; the hidden back can be
inferred from bilateral symmetry; every part maps to a procedural primitive (sphere, rounded box,
cylinder, torus, capsule spheres).

Conditional because: single front view only (depth of body and crank protrusion are inferred);
the reference is a toon illustration, so the output is explicitly stylized, not a replica; the
glass dome is one component, but it is a simple transmissive sphere with no caustics, so a
reconstruction path exists (MeshPhysicalMaterial transmission + a painted-style highlight).

Not rejected: object is unambiguous; not a scene; nothing important is cropped (tray and crank
are in frame); no manufacturing-grade dimensions requested; text fidelity ("JACK GACHA") is a
decal, not geometry.

Better input would be: none required. A side view would pin down body depth, but the user
accepts inference (depth ≈ 0.75 × dome diameter).
