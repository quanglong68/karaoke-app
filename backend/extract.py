import librosa
import numpy as np
import json
import sys
import os

# THÊM DÒNG NÀY ĐỂ ÉP PYTHON DÙNG UTF-8 TRÊN WINDOWS
sys.stdout.reconfigure(encoding='utf-8')

# 1. Nhận đường dẫn file từ hệ thống (Java truyền sang)
if len(sys.argv) < 2:
    print("❌ Lỗi: Cần truyền đường dẫn file âm thanh!")
    sys.exit(1)

file_path = sys.argv[1]
print(f"🎙️ Python đang xử lý Vocal: {file_path}")

try:
    # 2. Đọc file âm thanh
    y, sr = librosa.load(file_path, sr=22050)

    # 3. Trích xuất tần số bằng thuật toán xịn
    f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))

    # 4. Dọn dẹp dữ liệu và lấy mẫu mỗi 0.2s
    pitch_contour = np.nan_to_num(f0).tolist()
    hop_length = int(0.2 * sr / 512)
    reduced_contour = pitch_contour[::hop_length]
    reduced_contour = [round(hz, 2) for hz in reduced_contour]

    # 5. Lưu kết quả ra file JSON có cùng tên
    file_name_without_ext = os.path.splitext(file_path)[0]
    output_filename = f"{file_name_without_ext}.json"

    with open(output_filename, "w", encoding='utf-8') as f:
        json.dump(reduced_contour, f)

    print(f"✅ Python đã xử lý xong: {output_filename}")

except Exception as e:
    print(f"❌ Lỗi bên trong Python: {str(e)}")
    sys.exit(1)