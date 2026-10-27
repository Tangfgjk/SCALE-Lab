"""Prepare original article text and image positions from the retained source captures.

HTML is parsed as data. No scripts, embedded widgets or remote HTML are executed.
Run after source images have been downloaded into the capture directory.
"""
import hashlib
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString, Comment
from PIL import Image

SERVER = Path(__file__).resolve().parents[1]
CAPTURE = SERVER / 'storage/source-captures/wechat-20261018'
OUT = SERVER / 'seed-content/wechat-originals-20261020.json'
MEDIA = SERVER / 'seed-media/wechat-originals-20261020'
BLOCKS = {'p', 'section', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'figure', 'figcaption', 'tr', 'td', 'th', 'ul', 'ol', 'table'}


def compact(value):
    return re.sub(r'\s+', '', value)


def prepare(article):
    root = BeautifulSoup((CAPTURE / (article['id'] + '.html')).read_text(encoding='utf-8'), 'html.parser').find(id='js_content')
    if root is None:
        raise ValueError('Missing original body: ' + article['id'])
    for tag in root.find_all(['script', 'style']):
        tag.decompose()
    image_by_url = {i['url']: i for i in article['images']}
    nodes, inline, images, excluded = [], [], {}, []

    def flush():
        nonlocal inline
        if any(n.get('text', '').strip() for n in inline):
            nodes.append({'type': 'paragraph', 'content': inline})
        inline = []

    def walk(tag, marks=()):
        if isinstance(tag, Comment):
            return
        if isinstance(tag, NavigableString):
            text = str(tag)
            if not text.strip():
                # Preserve inline spaces, but ignore indentation between blocks.
                if inline and '\n' not in text:
                    inline.append({'type': 'text', 'text': text})
                return
            node = {'type': 'text', 'text': text}
            if marks:
                node['marks'] = list(marks)
            inline.append(node)
            return
        name = tag.name
        if name == 'img':
            flush()
            url = tag.get('data-src') or tag.get('src')
            image = image_by_url.get(url)
            if not image:
                raise ValueError('Unmapped original image: ' + str(url))
            index = image['index']
            src = CAPTURE / (image.get('localFile') or f"{article['id']}-{index}.image")
            with Image.open(src) as pic:
                frames = getattr(pic, 'n_frames', 1)
                if frames > 1:
                    excluded.append({'index': index, 'url': url, 'reason': '公众号装饰/关注/点赞动图；原文件保留在来源快照，不插入新闻正文', 'frames': frames})
                    return
                # Save static originals in their decoded source format; server handles publication-size encoding.
                image_format = (pic.format or 'PNG').upper()
                extension = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}.get(image_format, 'png')
                filename = f"{article['id']}-{index}.{extension}"
                dst = MEDIA / filename
                if image_format in {'JPEG', 'PNG', 'WEBP'}:
                    dst.write_bytes(src.read_bytes())
                else:
                    pic.convert('RGB').save(dst, 'PNG')
            images[index] = {'index': index, 'url': url, 'file': filename, 'sha256': hashlib.sha256(dst.read_bytes()).hexdigest()}
            nodes.append({'type': 'image', 'attrs': {'sourceImage': index, 'caption': '', 'width': 'large', 'align': 'center'}})
            return
        if name == 'br':
            if inline:
                inline.append({'type': 'hardBreak'})
            return
        is_block = name in BLOCKS
        if is_block:
            flush()
        new_marks = list(marks)
        style = tag.get('style', '')
        mark = {'strong': 'bold', 'b': 'bold', 'em': 'italic', 'i': 'italic', 'u': 'underline', 's': 'strike'}.get(name)
        if not mark and re.search(r'font-weight\s*:\s*(bold|[6-9]00)', style):
            mark = 'bold'
        if mark and not any(m['type'] == mark for m in new_marks):
            new_marks.append({'type': mark})
        if name == 'a':
            href = tag.get('href', '').strip()
            if re.match(r'https?://', href) and len(href) <= 2000 and not re.search(r'\s', href):
                new_marks = [m for m in new_marks if m['type'] != 'link'] + [{'type': 'link', 'attrs': {'href': href}}]
        for child in tag.children:
            walk(child, tuple(new_marks))
        if is_block:
            flush()

    walk(root)
    flush()
    def text_of(node):
        return node.get('text', '') + ''.join(text_of(c) for c in node.get('content', []))
    original = root.get_text()
    extracted = ''.join(text_of(n) for n in nodes)
    assert compact(original) == compact(extracted), 'Body text changed: ' + article['id']
    assert len(images) <= 50
    first = next((text_of(n).strip() for n in nodes if n['type'] == 'paragraph'), article['title'])
    return {'sourceId': article['id'], 'url': article['url'], 'title': article['title'], 'account': article['account'],
            'publishedAt': article['published'], 'summary': first[:200],
            'bodyTextSha256': hashlib.sha256(compact(original).encode()).hexdigest(),
            'bodyCharacters': len(compact(original)), 'richText': {'schemaVersion': 1, 'type': 'doc', 'content': nodes},
            'images': list(images.values()), 'excludedImages': excluded}


def main():
    MEDIA.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((CAPTURE / 'manifest.json').read_text(encoding='utf-8'))
    result = [prepare(a) for a in sorted(manifest, key=lambda a: a['published'])]
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for a in result:
        print(a['sourceId'], a['bodyCharacters'], 'characters;', len(a['images']), 'static images;', len(a['excludedImages']), 'decorative animations excluded')


if __name__ == '__main__':
    main()
