import { Sparkles } from "lucide-react";

interface AIQuestionChipProps {
  label: string;
  onClick: () => void;
  className?: string;
}

export default function AIQuestionChip({
  label,
  onClick,
  className = "",
}: AIQuestionChipProps) {
  return (
    <button
      type="button"
      className={`cursor-pointer px-2 py-[3px] text-green-700 rounded-full hover:bg-green-700/10 border border-green-700/30 ${className}`}
      onClick={onClick}
    >
      <Sparkles className="size-4 inline mb-1 mr-1 text-green-700" />
      <span className="text-sm">{label}</span>
    </button>
  );
}
