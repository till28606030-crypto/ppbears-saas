/**
 * 壓縮圖片大小並產生縮圖
 * @param file 原始圖片檔案
 * @param maxWidth 縮圖最大寬度
 * @param maxHeight 縮圖最大高度
 * @param quality 壓縮品質 (0-1)
 * @returns 壓縮後的 Blob 和新的檔名
 */
export const generateThumbnail = async (
    file: File,
    maxWidth: number = 300,
    maxHeight: number = 300,
    quality: number = 0.8
): Promise<{ blob: Blob; filename: string }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // 計算等比例縮放
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas getContext failed'));
                    return;
                }

                // 保持透明背景（確保 PNG 背景透明度維持）
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // 如果是去背素材/貼圖有透明背景，盡量轉存為 webp 保持透明與高壓縮率
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                            const newFilename = `${originalName}_thumb.webp`;
                            resolve({ blob, filename: newFilename });
                        } else {
                            reject(new Error('Canvas toBlob failed'));
                        }
                    },
                    'image/webp',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Image load failed'));
            img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(file);
    });
};
