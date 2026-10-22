# Analysis tools: overview

The protocol, the response schemas and the master table layouts used by the server were derived from the
4.3.1 client and checked on the bench. The research tools for the client binary (including the Ghidra
scripts, formerly `recon/ghidra/`) and the detailed analysis notes are kept private; this page lists only
the public tools and what they produce.

<a id="tools"></a>
## Python tools (`recon/tools/`, always `python -I`)

- Protocol and schemas: `action_case.py`, `response_schema.py`, `batch_schema.py`, `request_ids.py`,
  `getter_ids.py`, `master_types.py`, `master_fields.py`. Their outputs are the interface descriptions in
  `recon/out/`: endpoints, response schemas (`api_responses_ww431.json`, `api_responses_auto_ww431.json`),
  master table names, fields and types (`master_fields_ww431.*`, `master_types_ww431.json`), `misc` ids.
- Texts and widget names: `text_ids.py`, `ui_text_ids.py`, `widget_lookup.py`, `func_strings.py`.
- Packs (the container decoding tools `bgad.py`, `bgad_extract.py`, `resource_index.py` and the key
  analysis tools are kept private, see `private_tools.py`): `bgad_names.py`, `bgi_check.py`,
  `resource_pack.py`, `resource_merge.py`, `resource_split.py`, `res_get.py`, `res_bulk.py`,
  `catalog.py`, `asset_coverage.py`, `btf.py`, `btf_fix.py`, `dex_consts.py`.
- Data: `raw_master.py`, `raw_master_old.py`, `wiki_dump.py`, `wiki_quests.py`,
  `fetch_medal_images.py`, `fetch_material_icons.py`, `import_ui_texts.py`.
- Maps: `stage_poi.py`, `mappoi_gen.py`, `mappoi_room.py`, `gen_story_maps.py`, `validate_maps.py`,
  `smoke_pick.py`.
- Resource generators: `make_layouts.py`, `make_textures.py`, `gen_sphere_armatures.py`,
  `make_enemy_moves.py`, `layout_tree.py`, `scene_tree.py`, `import_jp_coco.py` (original JP layouts
  in place of the generated ones) and `jp_coco_widgets.py` ([risorse_layout](risorse_layout.md#jp-originali)).

<a id="singleton"></a>
## Facts the server relies on

- Master rows are looked up by id without a null check: a row the client asks for and the server does
  not send makes the client crash. Every id the client may ask for must have a row (`misc` included).
- Details of the client analysis are kept in the private notes.
