export type TimeFrameOption = {
  value: string;
  label: string;
};

type TimeFrameSelectorProps = {
  options: TimeFrameOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  buttonWidthClass?: string;
};

export default function TimeFrameSelector({
  options,
  value,
  onChange,
  className,
}: TimeFrameSelectorProps) {
  return (
    <div
      className={`flex items-center justify-end gap-2 pb-2 mb-2 ${className ?? ""}`}
    >
      {options.map((option, index) => (
        <span key={option.value} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`$ win-w-10 px-2 cursor-pointer border-b-2 pb-1 text-center text-sm uppercase tracking-wide transition-colors -mb-0.5 ${
              value === option.value
                ? "border-green-700 font-semibold text-green-700"
                : "border-transparent text-gray-400 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            {option.label}
          </button>
          {index < options.length - 1 && (
            <span className="h-5 w-px bg-gray-300" aria-hidden="true" />
          )}
        </span>
      ))}
    </div>
  );
}
