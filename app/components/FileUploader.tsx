import Uppy from "@uppy/core";
import DragDrop from "@uppy/drag-drop";
import Japanese from "@uppy/locales/lib/ja_JP";
import { Dashboard, useUppyEvent } from "@uppy/react";
import { useState } from "react";
import "@uppy/dashboard/dist/style.css";

interface FileUploaderProps {
  onTextLoaded: (text: string) => void;
}

export function FileUploader({ onTextLoaded }: FileUploaderProps) {
  if (typeof window === "undefined") return <></>;
  const [uppy] = useState(() =>
    new Uppy({
      restrictions: { maxNumberOfFiles: 1, allowedFileTypes: [".txt"] },
      locale: {
        strings: {
          ...Japanese.strings,
          dropPasteImportFiles:
            "ここにファイルをドロップするか%{browse}してください",
        },
        pluralize: Japanese.pluralize,
      },
    }).use(DragDrop, {}),
  );

  useUppyEvent(uppy, "file-added", async (file) => {
    const text = await file.data.text();
    onTextLoaded(text);
    uppy.removeFile(file.id);
  });

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
