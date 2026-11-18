"""Just enough YAML for PaddleOCR inference.yml: nested maps, scalar values and the
character_dict list (one '- x' per line). Not a general parser."""


def load(text):
    root = {}
    stack = [(-1, root)]
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        raw = lines[i]
        i += 1
        if not raw.strip() or raw.lstrip().startswith('#'):
            continue
        indent = len(raw) - len(raw.lstrip(' '))
        s = raw.strip()
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        if s.startswith('- '):
            # list item under the current key
            key = parent.get('__list__')
            parent.setdefault(key, []).append(unquote(s[2:]))
            stack.append((indent - 1, parent))  # keep parent for following items
            continue
        if ':' not in s:
            continue
        k, _, v = s.partition(':')
        k = k.strip()
        v = v.strip()
        if v == '' or v == '|' or v == '>':
            # map or list follows
            child = {}
            parent[k] = child
            parent['__list__'] = k
            stack.append((indent, child))
            # peek: if the next non-empty line is a list item at greater indent, this key holds a list
            j = i
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and lines[j].strip().startswith('- '):
                parent[k] = []
                lst = parent[k]
                while j < len(lines):
                    ln = lines[j]
                    if not ln.strip():
                        j += 1
                        continue
                    ind = len(ln) - len(ln.lstrip(' '))
                    if ind <= indent or not ln.strip().startswith('- '):
                        break
                    lst.append(unquote(ln.strip()[2:]))
                    j += 1
                i = j
                stack.pop()
        else:
            parent[k] = unquote(v)
    return flatten(root)


def unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in '\'"':
        return v[1:-1]
    return v


def flatten(d, out=None):
    """Collect every key at any depth (keys are unique enough in inference.yml)."""
    out = {} if out is None else out
    for k, v in d.items():
        if k == '__list__':
            continue
        if isinstance(v, dict):
            flatten(v, out)
        else:
            out.setdefault(k, v)
    return out
