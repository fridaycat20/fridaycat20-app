import Uppy, { type UppyFile, type Meta, type Body } from "@uppy/core";
import DragDrop from "@uppy/drag-drop";
import Japanese from "@uppy/locales/lib/ja_JP";
import { Dashboard } from "@uppy/react";
import { useState, useEffect } from "react";
import "@uppy/dashboard/dist/style.css";

interface FileUploaderProps {
  onTextLoaded: (text: string) => void;
}

export function FileUploader({ onTextLoaded }: FileUploaderProps) {
  const [isClient, setIsClient] = useState(false);
  const [uppy, setUppy] = useState<Uppy | null>(null);

  useEffect(() => {
    setIsClient(true);
    
    // クライアントサイドでのみUppyを初期化
    const uppyInstance = new Uppy({
      restrictions: { maxNumberOfFiles: 1, allowedFileTypes: [".txt"] },
      locale: {
        strings: {
          ...Japanese.strings,
          dropPasteImportFiles:
            "ここにファイルをドロップするか%{browse}してください",
        },
        pluralize: Japanese.pluralize,
      },
    }).use(DragDrop, {});
    
    setUppy(uppyInstance);

    // クリーンアップ
    return () => {
      uppyInstance.destroy();
    };
  }, []);

  // Uppyイベントハンドリング（uppyがnullでない場合のみ）
  useEffect(() => {
    if (!uppy) return;

    const handleFileAdded = async (file: UppyFile<Meta, Body>) => {
      const text = await file.data.text();
      onTextLoaded(text);
      uppy.removeFile(file.id);
    };

    uppy.on("file-added", handleFileAdded);

    return () => {
      uppy.off("file-added", handleFileAdded);
    };
  }, [uppy, onTextLoaded]);

  // クライアントサイドでのみレンダリング
  if (!isClient || !uppy) {
    return (
      <div className="file-uploader-container">
        <div style={{ 
          height: 200, 
          border: '2px dashed #ccc', 
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666'
        }}>
          ファイルアップローダーを読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className="file-uploader-container">
      <style>{`
        .file-uploader-container .uppy-Dashboard-AddFiles-list {
          display: none !important;
        }
        .file-uploader-container .uppy-Dashboard-AddFiles-title {
          max-width: 100% !important;
        }
      
      `}</style>
      <Dashboard
        uppy={uppy}
        proudlyDisplayPoweredByUppy={false}
        note="テキストファイル（.txt）のみ対応"
        height={200}
        width={"100%"}
        hideUploadButton
        hidePauseResumeButton
        hideCancelButton
        hideRetryButton
        showRemoveButtonAfterComplete
        showSelectedFiles={false}
      />
    </div>
  );
}
