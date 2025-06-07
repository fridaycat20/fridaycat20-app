import Uppy from "@uppy/core";
import DragDrop from "@uppy/drag-drop";
import { Dashboard, useUppyEvent } from "@uppy/react";
import { useState } from "react";
import "@uppy/dashboard/dist/style.css";

interface FileUploaderProps {
  onTextLoaded: (text: string) => void;
}

export function FileUploader({ onTextLoaded }: FileUploaderProps) {
  if (typeof window === "undefined") return <></>;
  const [uppy] = useState(
    new Uppy({
      restrictions: { maxNumberOfFiles: 1, allowedFileTypes: [".txt"] },
      autoProceed: true,
    }).use(DragDrop),
  );

  useUppyEvent(uppy, "file-added", async (file) => {
    const text = await file.data.text();
    onTextLoaded(text);
    uppy.removeFile(file.id);
  });

  return (
    <Dashboard
      uppy={uppy}
      proudlyDisplayPoweredByUppy={false}
      note="テキストファイル（.txt）のみ対応・ドラッグ＆ドロップまたはクリックで選択"
      height={300}
      width={"100%"}
      hideUploadButton
      hidePauseResumeButton
      hideCancelButton
      hideRetryButton
      showRemoveButtonAfterComplete
      showSelectedFiles={false}
    />
  );
}
