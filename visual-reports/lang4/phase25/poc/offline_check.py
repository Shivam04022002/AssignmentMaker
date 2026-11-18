"""Runs detection + recognition with every socket connection forbidden: proof that
inference needs no network. Any attempt to connect raises and is reported."""
import os
import socket
import sys

attempts = []
_real_connect = socket.socket.connect
_real_connect_ex = socket.socket.connect_ex
_real_create = socket.create_connection


def _deny(*a, **k):
    attempts.append(str(a[1] if len(a) > 1 else a))
    raise OSError('network blocked by offline_check')


socket.socket.connect = _deny
socket.socket.connect_ex = _deny
socket.create_connection = _deny
socket.getaddrinfo = lambda *a, **k: (_ for _ in ()).throw(OSError('dns blocked by offline_check'))

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cv2  # noqa: E402
from ppocr import Detector, Recognizer, crop_box  # noqa: E402

img = cv2.imread('D:/AssignmentMaker/reference/handwriting_03.png')
det = Detector()
en = Recognizer('en_PP-OCRv5_mobile_rec_onnx')
dev = Recognizer('devanagari_PP-OCRv5_mobile_rec_onnx')
boxes, _ = det(img)
r = en(crop_box(img, boxes[0][0]))
r2 = dev(crop_box(img, boxes[0][0]))
print('ran det + en rec + deva rec with sockets blocked:', len(boxes), 'boxes; first text', repr(r['text']), '| deva model also ran:', len(r2['text']) >= 0)
print('connection attempts during inference:', attempts)
import onnxruntime as ort  # noqa: E402
print('onnxruntime', ort.__version__, 'providers', ort.get_available_providers())
