import React, { useRef, useState } from "react";
import { Image as ImageIcon, Upload, RefreshCw, Trash2 } from "lucide-react";

export default function ImageDropCard({
  stepNum,
  title,
  isRequired,
  imageData,
  statusText,
  disabled,
  onImageSelected,
  onImageRemoved
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file (JPG, PNG, WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      const img = new Image();
      img.onload = () => {
        onImageSelected({
          file,
          dataUrl,
          imgElement: img,
          width: img.naturalWidth,
          height: img.naturalHeight,
          name: file.name,
          format: file.name.split(".").pop().toUpperCase(),
          sizeMb: (file.size / (1024 * 1024)).toFixed(1)
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-2.5">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-[#00E987] text-[#080D0B] font-bold text-[11px] flex items-center justify-center">
            {stepNum}
          </span>
          <span className="text-xs font-bold text-white">{title}</span>
        </div>
        {statusText && (
          <span className="text-[11px] font-bold text-[#00E987]">
            {statusText}
          </span>
        )}
      </div>

      {/* Main Container */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Preview / Drop Box */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !imageData && !disabled && fileInputRef.current?.click()}
          className={`flex-1 h-36 sm:h-40 rounded-xl border flex items-center justify-center relative overflow-hidden transition-all ${
            isDragOver
              ? "border-[#00E987] bg-[#0E1C16]/90 shadow-[0_0_12px_rgba(0,233,135,0.2)]"
              : "border-[#20352B] bg-[#090F0C]/85"
          } ${!imageData && !disabled ? "cursor-pointer hover:border-[#00E987]/50" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled}
          />

          {!imageData ? (
            <div className="flex flex-col items-center gap-1.5 p-4 text-center">
              <ImageIcon size={26} className="text-[#91A69A]" />
              <span className="text-[11px] text-[#91A69A]">Drag & Drop Image Here</span>
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16231D] hover:bg-[#1C2C24] border border-[#20352B] hover:border-[#00E987] text-[#E8F2ED] text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                <Upload size={14} className="text-[#00E987]" />
                Browse Image...
              </button>
            </div>
          ) : (
            <img
              src={imageData.dataUrl}
              alt="Preview"
              className="w-full h-full object-contain p-1"
            />
          )}
        </div>

        {/* Action Button Stack (Right on PC, Row on Mobile) */}
        {imageData && (
          <div className="flex sm:flex-col gap-2 sm:w-20">
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:h-[72px] flex items-center justify-center gap-1 sm:flex-col p-2 rounded-xl bg-[#16231D]/80 hover:bg-[#1C2C24] border border-[#20352B] hover:border-[#00E987] text-[#E8F2ED] hover:text-[#00E987] text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className="text-[#00E987]" />
              Replace
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onImageRemoved}
              className="flex-1 sm:h-[72px] flex items-center justify-center gap-1 sm:flex-col p-2 rounded-xl bg-[#16231D]/80 hover:bg-[#2D1919] border border-[#20352B] hover:border-[#FF5252] text-[#E8F2ED] hover:text-[#FF5252] text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              <Trash2 size={14} className="text-[#FF5252]" />
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Metadata footer */}
      {imageData && (
        <div className="text-[10px] text-[#91A69A] truncate px-1">
          {imageData.name} • <span className="font-mono">{imageData.width}×{imageData.height} px</span> • {imageData.format} • <span className="font-mono">{imageData.sizeMb} MB</span>
        </div>
      )}
    </div>
  );
}
