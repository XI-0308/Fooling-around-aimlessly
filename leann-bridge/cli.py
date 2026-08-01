#!/usr/bin/env python3
"""WE-E ↔ LEANN 桥接 CLI（stdout 输出 JSON）"""
from __future__ import annotations

import argparse
import json
import os
import sys
import traceback


def _emit(obj: dict) -> None:
    print(json.dumps(obj, ensure_ascii=False))


def cmd_probe(_: argparse.Namespace) -> int:
    try:
        import leann  # noqa: F401

        version = getattr(leann, "__version__", "unknown")
        pdf_ok = False
        pdf_error = ""
        try:
            import fitz  # noqa: F401

            pdf_ok = True
        except Exception as exc:
            pdf_error = str(exc)
        _emit({"ok": True, "version": version, "pdf": pdf_ok, "pdfError": pdf_error})
        return 0
    except Exception as exc:
        _emit({"ok": False, "error": str(exc)})
        return 1


def _extract_pdf_text(path: str) -> tuple[str, int]:
    import fitz

    doc = fitz.open(path)
    try:
        parts: list[str] = []
        for i in range(len(doc)):
            page_text = doc[i].get_text("text").strip()
            if page_text:
                parts.append(f"【第 {i + 1} 页】\n{page_text}")
        return "\n\n".join(parts), len(doc)
    finally:
        doc.close()


def cmd_extract(args: argparse.Namespace) -> int:
    try:
        path = args.input
        ext = os.path.splitext(path)[1].lower()
        page_count = 0

        if ext == ".pdf":
            text, page_count = _extract_pdf_text(path)
        elif ext in (".txt", ".md", ".json"):
            with open(path, encoding="utf-8") as f:
                text = f.read()
        else:
            raise ValueError(f"不支持的格式：{ext or '(无扩展名)'}")

        text = text.strip()
        if not text:
            raise ValueError("未能提取到文本（扫描版 PDF 需 OCR，暂不支持）")

        _emit(
            {
                "ok": True,
                "text": text,
                "chars": len(text),
                "pages": page_count,
                "format": ext.lstrip(".") or "unknown",
            }
        )
        return 0
    except Exception as exc:
        _emit({"ok": False, "error": str(exc), "trace": traceback.format_exc()})
        return 1


def _serialize_result(item) -> dict:
    if isinstance(item, dict):
        md = item.get("metadata") or {}
        idx = md.get("idx") if isinstance(md, dict) else None
        text = item.get("text") or item.get("content") or ""
        score = float(item.get("score", item.get("distance", 0)) or 0)
        return {"idx": idx, "text": text, "score": score}

    md = getattr(item, "metadata", None)
    idx = None
    if isinstance(md, dict):
        idx = md.get("idx")
    text = (
        getattr(item, "text", None)
        or getattr(item, "content", None)
        or getattr(item, "document", None)
        or ""
    )
    score = getattr(item, "score", None)
    if score is None:
        score = getattr(item, "distance", 0)
    try:
        score = float(score or 0)
    except (TypeError, ValueError):
        score = 0.0
    return {"idx": idx, "text": str(text), "score": score}


def cmd_build(args: argparse.Namespace) -> int:
    try:
        from leann import LeannBuilder

        with open(args.chunks, encoding="utf-8-sig") as f:
            texts = json.load(f)
        if not isinstance(texts, list):
            raise ValueError("chunks 文件必须是字符串数组")

        kwargs: dict = {"backend_name": "hnsw"}
        if args.embedding_mode:
            kwargs["embedding_mode"] = args.embedding_mode

        builder = LeannBuilder(**kwargs)
        for i, text in enumerate(texts):
            if not isinstance(text, str):
                text = str(text)
            builder.add_text(text, metadata={"idx": i})

        index_dir = os.path.dirname(os.path.abspath(args.index))
        if index_dir:
            os.makedirs(index_dir, exist_ok=True)
        builder.build_index(args.index)
        _emit({"ok": True, "count": len(texts), "index": args.index})
        return 0
    except Exception as exc:
        _emit({"ok": False, "error": str(exc), "trace": traceback.format_exc()})
        return 1


def cmd_search(args: argparse.Namespace) -> int:
    try:
        from leann import LeannSearcher

        searcher = LeannSearcher(args.index)
        results = searcher.search(args.query, top_k=args.top_k)
        hits = [_serialize_result(r) for r in results]
        _emit({"ok": True, "hits": hits})
        return 0
    except Exception as exc:
        _emit({"ok": False, "error": str(exc), "hits": []})
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="WE-E LEANN bridge")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("probe", help="检测 leann 是否可用")

    p_build = sub.add_parser("build", help="从 chunks.json 构建索引")
    p_build.add_argument("--index", required=True, help=".leann 索引路径")
    p_build.add_argument("--chunks", required=True, help="UTF-8 JSON 字符串数组")
    p_build.add_argument("--embedding-mode", default="", help="LEANN embedding_mode")

    p_search = sub.add_parser("search", help="语义检索")
    p_search.add_argument("--index", required=True)
    p_search.add_argument("--query", required=True)
    p_search.add_argument("--top-k", type=int, default=5)

    p_extract = sub.add_parser("extract", help="从 PDF / 文本文件提取正文")
    p_extract.add_argument("--input", required=True, help="文件路径")

    args = parser.parse_args()
    if args.command == "probe":
        return cmd_probe(args)
    if args.command == "build":
        return cmd_build(args)
    if args.command == "search":
        return cmd_search(args)
    if args.command == "extract":
        return cmd_extract(args)
    return 2


if __name__ == "__main__":
    sys.exit(main())
