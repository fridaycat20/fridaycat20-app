export enum ProcessingStatus {
  RECOGNIZING_SPEECH = "音声を認識中...",
  SUMMARIZING_CONTENT = "内容を要約中...",
  GENERATING_COMIC = "4コマ漫画を生成中...",
  SELECTING_BEST_IMAGE = "最適な画像を選択中...",
  ANALYZING_IMAGE = "生成された画像を解析中...",
  MASKING_TEXT = "テキスト領域を白塗り中...",
  TRANSLATING_TEXT = "テキストを日本語に翻訳中...",
  DRAWING_TEXT = "翻訳テキストを画像に描画中...",
}

export enum ErrorMessage {
  SPEECH_RECOGNITION_FAILED = "音声認識に失敗しました。",
  PROCESSING_ERROR = "処理中にエラーが発生しました。",
  RESULT_PARSING_ERROR = "結果の処理中にエラーが発生しました。",
  GENERAL_ERROR = "エラーが発生しました。",
  CONNECTION_ERROR = "接続エラーが発生しました。",
  INPUT_REQUIRED = "議事録を入力してください。",
  VALIDATION_ERROR = "入力内容を確認してください。",
}

export enum EventType {
  STATUS = "status",
  ERROR = "error",
  COMPLETE = "complete",
}

export type LoadingStatus = ProcessingStatus | ErrorMessage | string;

export const isProcessingStatus = (value: string): value is ProcessingStatus => {
  return Object.values(ProcessingStatus).includes(value as ProcessingStatus);
};

export const isErrorMessage = (value: string): value is ErrorMessage => {
  return Object.values(ErrorMessage).includes(value as ErrorMessage);
};