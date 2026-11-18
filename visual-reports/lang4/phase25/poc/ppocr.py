"""
Minimal PP-OCRv5 (mobile) inference with ONNX Runtime: DB text detection and
CTC text recognition, written from the models' own inference.yml files.
Desktop proof of concept only; nothing here is part of the app.
"""
import math
import os
import time

import cv2
import numpy as np
import onnxruntime as ort
import pyclipper
import yaml_min as yml  # tiny yml reader (below) to avoid an extra dependency
from shapely.geometry import Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
# The model folder: PPOCR_MODELS, or ./models beside this file (models are downloaded, never committed).
MODELS = os.environ.get('PPOCR_MODELS') or os.path.join(HERE, 'models')


def session(path):
    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    so.log_severity_level = 3
    return ort.InferenceSession(path, so, providers=['CPUExecutionProvider'])


# --- Detection (DB) --------------------------------------------------------------------------------

class Detector:
    def __init__(self, name='PP-OCRv5_mobile_det_onnx', limit_side=960, thresh=0.3, box_thresh=0.6, unclip_ratio=1.5):
        self.sess = session(os.path.join(MODELS, name, 'inference.onnx'))
        self.input = self.sess.get_inputs()[0].name
        self.limit_side = limit_side
        self.thresh, self.box_thresh, self.unclip_ratio = thresh, box_thresh, unclip_ratio
        self.mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        self.std = np.array([0.229, 0.224, 0.225], dtype=np.float32)

    def _prep(self, img):
        h, w = img.shape[:2]
        ratio = 1.0
        if max(h, w) > self.limit_side:
            ratio = self.limit_side / max(h, w)
        rh, rw = max(32, int(round(h * ratio / 32)) * 32), max(32, int(round(w * ratio / 32)) * 32)
        resized = cv2.resize(img, (rw, rh))
        x = (resized.astype(np.float32) / 255.0 - self.mean) / self.std
        x = x.transpose(2, 0, 1)[None]
        return x, rh / h, rw / w

    def __call__(self, img_bgr):
        img = img_bgr  # inference.yml: DecodeImage img_mode BGR (no channel swap)
        x, sy, sx = self._prep(img)
        t = time.perf_counter()
        prob = self.sess.run(None, {self.input: x})[0][0, 0]
        dt = time.perf_counter() - t
        boxes = self._boxes(prob, sx, sy, img.shape[1], img.shape[0])
        return boxes, dt

    def _boxes(self, prob, sx, sy, w, h):
        bitmap = (prob > self.thresh).astype(np.uint8)
        contours, _ = cv2.findContours(bitmap, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        out = []
        for c in contours:
            if len(c) < 4:
                continue
            rect = cv2.minAreaRect(c)
            if min(rect[1]) < 3:
                continue
            score = self._score(prob, c)
            if score < self.box_thresh:
                continue
            poly = cv2.boxPoints(rect)
            try:
                pg = Polygon(poly)
                if pg.area <= 0 or pg.length <= 0:
                    continue
                dist = pg.area * self.unclip_ratio / pg.length
                off = pyclipper.PyclipperOffset()
                off.AddPath([tuple(p) for p in poly], pyclipper.JT_ROUND, pyclipper.ET_CLOSEDPOLYGON)
                ex = off.Execute(dist)
                if not ex:
                    continue
                ex = np.array(ex[0], dtype=np.float32)
            except Exception:
                continue
            rect2 = cv2.minAreaRect(ex)
            if min(rect2[1]) < 5:
                continue
            box = cv2.boxPoints(rect2)
            box[:, 0] = np.clip(box[:, 0] / sx, 0, w - 1)
            box[:, 1] = np.clip(box[:, 1] / sy, 0, h - 1)
            out.append((order_points(box), float(score)))
        out.sort(key=lambda b: (b[0][:, 1].mean(), b[0][:, 0].mean()))
        return out

    @staticmethod
    def _score(prob, contour):
        mask = np.zeros(prob.shape, dtype=np.uint8)
        cv2.fillPoly(mask, [contour], 1)
        return float(prob[mask == 1].mean()) if mask.any() else 0.0


def order_points(pts):
    pts = np.array(pts, dtype=np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    tl, br = pts[np.argmin(s)], pts[np.argmax(s)]
    tr, bl = pts[np.argmin(d)], pts[np.argmax(d)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def crop_box(img, box):
    w = int(max(np.linalg.norm(box[0] - box[1]), np.linalg.norm(box[2] - box[3])))
    h = int(max(np.linalg.norm(box[0] - box[3]), np.linalg.norm(box[1] - box[2])))
    dst = np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype=np.float32)
    m = cv2.getPerspectiveTransform(box, dst)
    out = cv2.warpPerspective(img, m, (max(1, w), max(1, h)), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    if h > 1.5 * w:
        out = np.rot90(out)
    return out


# --- Recognition (CTC) -----------------------------------------------------------------------------

class Recognizer:
    def __init__(self, name='en_PP-OCRv5_mobile_rec_onnx', height=48, max_width=320):
        folder = os.path.join(MODELS, name)
        self.sess = session(os.path.join(folder, 'inference.onnx'))
        self.input = self.sess.get_inputs()[0].name
        cfg = yml.load(open(os.path.join(folder, 'inference.yml'), encoding='utf-8').read())
        chars = cfg['character_dict']
        self.chars = ['<blank>'] + list(chars) + [' ']  # CTCLabelDecode with use_space_char
        self.height, self.max_width = height, max_width

    def _prep(self, crop_bgr):
        # PaddleOCR's dynamic width: the crop keeps its aspect ratio at height 48 (the
        # 320 of rec_image_shape is a minimum batch width, not a cap: a long line
        # squeezed to 320 px is unreadable), padded on the right to a multiple of 32.
        h, w = crop_bgr.shape[:2]
        ratio = w / float(h)
        rw = max(8, min(4096, int(math.ceil(self.height * ratio))))
        width = max(self.max_width, int(math.ceil(rw / 32.0)) * 32)
        resized = cv2.resize(crop_bgr, (rw, self.height))
        x = resized.astype(np.float32) / 255.0
        x = (x - 0.5) / 0.5
        x = x.transpose(2, 0, 1)
        padded = np.zeros((3, self.height, width), dtype=np.float32)
        padded[:, :, :rw] = x
        self._last_width = width
        return padded[None], rw

    def __call__(self, crop_bgr):
        """→ { text, conf (mean char prob), chars: [{ch, prob, t0, t1, x0, x1}], ms }"""
        x, rw = self._prep(crop_bgr)
        t = time.perf_counter()
        y = self.sess.run(None, {self.input: x})[0][0]  # [T, C]
        ms = (time.perf_counter() - t) * 1000
        T = y.shape[0]
        idx = y.argmax(axis=1)
        prob = y.max(axis=1)
        chars = []
        prev = 0
        start = None
        for t_i, (k, p) in enumerate(zip(idx, prob)):
            if k != 0 and k != prev:
                chars.append({'ch': self.chars[k] if k < len(self.chars) else '?', 'prob': float(p), 't0': t_i, 't1': t_i})
            elif k != 0 and k == prev and chars:
                chars[-1]['t1'] = t_i
                chars[-1]['prob'] = max(chars[-1]['prob'], float(p))
            prev = k
        # Time steps cover the padded width; map to the crop's own width.
        scale = self._last_width / T
        for c in chars:
            c['x0'] = c['t0'] * scale * (crop_bgr.shape[1] / rw)
            c['x1'] = (c['t1'] + 1) * scale * (crop_bgr.shape[1] / rw)
        text = ''.join(c['ch'] for c in chars)
        conf = float(np.mean([c['prob'] for c in chars])) if chars else 0.0
        return {'text': text, 'conf': conf, 'min_conf': float(min([c['prob'] for c in chars])) if chars else 0.0, 'chars': chars, 'ms': ms, 'steps': T}
