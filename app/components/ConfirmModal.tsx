import React from "react";

interface ConfirmModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal = ({ onCancel, onConfirm }: ConfirmModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
      <div className="mb-6 text-lg font-bold text-gray-800">
        入力内容を上書きしますか？
      </div>
      <div className="mb-6 text-gray-600">
        テキストエリアには既に内容が入力されています。ファイルの内容で上書きしてもよろしいですか？
      </div>
      <div className="flex justify-end gap-4">
        <button
          type="button"
          className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold"
          onClick={onCancel}
        >
          キャンセル
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
          onClick={onConfirm}
        >
          OK
        </button>
      </div>
    </div>
  </div>
);
