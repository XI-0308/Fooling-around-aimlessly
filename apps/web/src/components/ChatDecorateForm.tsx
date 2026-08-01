"use client";

import { useRef, useState } from "react";
import {
  BgColorsOutlined,
  FontSizeOutlined,
  LayoutOutlined,
} from "@ant-design/icons";
import EncoreBlockTitle from "@/components/EncoreBlockTitle";
import SettingsFold from "@/components/SettingsFold";
import {
  CHAT_FONT_SIZE_FIELDS,
  CHAT_THEME_BRAND_COLOR_FIELDS,
  CHAT_THEME_BUBBLE_COLOR_FIELDS,
  CHAT_THEME_BUTTON_COLOR_FIELDS,
  CHAT_THEME_TEXT_COLOR_FIELDS,
  CHAT_THEME_UI_COLOR_FIELDS,
  SYSTEM_FONT_SIZE_FIELDS,
  compressImageForAppIcon,
  compressImageForTheme,
  hexToRgba,
  type ChatTheme,
} from "@/lib/chatTheme";

interface ChatDecorateFormProps {
  theme: ChatTheme;
  onChange: (theme: ChatTheme) => void;
  onSave: () => void;
}

function ColorPickerField({
  label,
  color,
  opacity,
  showOpacity = false,
  onChange,
}: {
  label: string;
  color: string;
  opacity?: number;
  showOpacity?: boolean;
  onChange: (next: { color?: string; opacity?: number }) => void;
}) {
  const preview =
    showOpacity && opacity !== undefined ? hexToRgba(color, opacity / 100) : color;
  return (
    <div className="bubble-color-field bubble-color-field-compact">
      <div className="bubble-color-head">
        <span>{label}</span>
        <span className="bubble-color-swatch" style={{ background: preview }} title="当前颜色预览" />
      </div>
      <div className="bubble-color-controls">
        <input
          type="color"
          className="decorate-color-input"
          value={color}
          onChange={(e) => onChange({ color: e.target.value })}
          aria-label={`${label}颜色`}
        />
        {showOpacity && opacity !== undefined && (
          <label className="bubble-opacity-row bubble-opacity-row-compact">
            <span>透明度 {opacity}%</span>
            <input
              type="range"
              min={5}
              max={100}
              value={opacity}
              onChange={(e) => onChange({ opacity: Number(e.target.value) })}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function BgImageSection({
  title,
  hint,
  image,
  busy,
  square,
  onPick,
  onClear,
}: {
  title: string;
  hint: string;
  image: string;
  busy: boolean;
  square?: boolean;
  onPick: (file: File) => Promise<void>;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    await onPick(file);
  }

  return (
    <div className="card decorate-section">
      <h4 className="decorate-subsection-title">{title}</h4>
      <p className="hint">{hint}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleChange}
      />
      {image ? (
        <div
          className={`decorate-bg-preview${square ? " decorate-bg-preview-square" : ""}`}
          style={{ backgroundImage: `url(${image})` }}
        />
      ) : (
        <div
          className={`decorate-bg-preview decorate-bg-empty${square ? " decorate-bg-preview-square" : ""}`}
        >
          {square ? "暂无应用图标" : "暂无背景图"}
        </div>
      )}
      <div className="decorate-bg-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "处理中…" : "从相册选择图片"}
        </button>
        {image && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClear}>
            清除
          </button>
        )}
      </div>
    </div>
  );
}

export default function ChatDecorateForm({ theme, onChange, onSave }: ChatDecorateFormProps) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  async function setBgImage(
    key: "messagesBgImage" | "loginBgImage",
    file: File,
    successHint: string
  ) {
    setBusy(true);
    setHint("");
    try {
      const dataUrl = await compressImageForTheme(file);
      onChange({ ...theme, [key]: dataUrl });
      setHint(successHint);
    } catch (err) {
      setHint(err instanceof Error ? err.message : "图片处理失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="decorate-form">
      <p className="hint decorate-intro">
        调整完成后点底部「保存」生效。所有界面元素均由此处逐项控制，无需切换预设主题；装饰会同步到服务器。
      </p>

      <SettingsFold title="背景图调整">
        <BgImageSection
          title="对话框背景"
          hint="从手机相册选择图片，铺满整个聊天消息区域。"
          image={theme.messagesBgImage}
          busy={busy}
          onPick={(file) => setBgImage("messagesBgImage", file, "背景图已设置，返回聊天即可看到效果")}
          onClear={() => {
            onChange({ ...theme, messagesBgImage: "" });
            setHint("已清除对话框背景图");
          }}
        />
        <BgImageSection
          title="登录页背景"
          hint="输入密码的登录页背景，从手机相册选择图片后铺满整页。"
          image={theme.loginBgImage}
          busy={busy}
          onPick={(file) =>
            setBgImage("loginBgImage", file, "登录页背景已设置，退出后重新打开登录页即可看到")
          }
          onClear={() => {
            onChange({ ...theme, loginBgImage: "" });
            setHint("已清除登录页背景图");
          }}
        />
        <BgImageSection
          title="应用图标（桌面）"
          hint="添加到手机桌面后的图标。选一张图会自动裁成正方形；保存后请删掉旧快捷方式再重新「添加到主屏幕」才会换新图标。"
          image={theme.appIconImage}
          busy={busy}
          square
          onPick={async (file) => {
            setBusy(true);
            setHint("");
            try {
              const dataUrl = await compressImageForAppIcon(file);
              onChange({ ...theme, appIconImage: dataUrl });
              setHint("应用图标已选好，点底部保存后生效");
            } catch (err) {
              setHint(err instanceof Error ? err.message : "图片处理失败");
            } finally {
              setBusy(false);
            }
          }}
          onClear={() => {
            onChange({ ...theme, appIconImage: "" });
            setHint("已清除自定义应用图标（将恢复默认 E）");
          }}
        />
      </SettingsFold>

      <SettingsFold title="颜色调整">
        <div className="decorate-section">
          <EncoreBlockTitle as="h3" icon={<BgColorsOutlined />} color="#f472b6">
            气泡颜色
          </EncoreBlockTitle>
          <p className="hint">点击色块打开系统选色面板（含黑白与全色谱），气泡可另调透明度。</p>
          <div className="bubble-color-grid">
            {CHAT_THEME_BUBBLE_COLOR_FIELDS.map(({ key, label, withOpacity }) => {
              const colorKey = key as "userBubble" | "assistantBubble";
              const opacityKey =
                colorKey === "userBubble" ? "userBubbleOpacity" : "assistantBubbleOpacity";
              return (
                <ColorPickerField
                  key={key}
                  label={label}
                  color={theme[colorKey]}
                  opacity={theme[opacityKey]}
                  showOpacity={withOpacity}
                  onChange={(next) =>
                    onChange({
                      ...theme,
                      ...(next.color ? { [colorKey]: next.color } : {}),
                      ...(next.opacity !== undefined ? { [opacityKey]: next.opacity } : {}),
                    })
                  }
                />
              );
            })}
          </div>
        </div>

        <div className="decorate-section">
          <EncoreBlockTitle as="h3" icon={<LayoutOutlined />} color="#818cf8">
            界面面板颜色
          </EncoreBlockTitle>
          <p className="hint">侧栏、顶栏、卡片、输入框与整体背景色，保存后立即全局生效。</p>
          <div className="bubble-color-grid">
            {CHAT_THEME_UI_COLOR_FIELDS.map(({ key, label }) => (
              <ColorPickerField
                key={key}
                label={label}
                color={theme[key] as string}
                onChange={(next) =>
                  onChange({
                    ...theme,
                    ...(next.color ? { [key]: next.color } : {}),
                  })
                }
              />
            ))}
          </div>
          <h4 className="decorate-subsection-title">按钮颜色</h4>
          <p className="hint">主按钮填充、线框按钮与次要按钮的边框/文字色，保存后全局按钮生效。</p>
          <div className="bubble-color-grid">
            {CHAT_THEME_BUTTON_COLOR_FIELDS.map(({ key, label }) => (
              <ColorPickerField
                key={key}
                label={label}
                color={theme[key] as string}
                onChange={(next) =>
                  onChange({
                    ...theme,
                    ...(next.color ? { [key]: next.color } : {}),
                  })
                }
              />
            ))}
          </div>
          <h4 className="decorate-subsection-title">品牌字渐变</h4>
          <p className="hint">侧栏与登录页「WE-E」标题的渐变三色，保存后立即生效。</p>
          <div className="bubble-color-grid">
            {CHAT_THEME_BRAND_COLOR_FIELDS.map(({ key, label }) => (
              <ColorPickerField
                key={key}
                label={label}
                color={theme[key] as string}
                onChange={(next) =>
                  onChange({
                    ...theme,
                    ...(next.color ? { [key]: next.color } : {}),
                  })
                }
              />
            ))}
          </div>
        </div>

        <div className="decorate-section">
          <EncoreBlockTitle as="h3" icon={<FontSizeOutlined />} color="#a78bfa">
            文字颜色
          </EncoreBlockTitle>
          <p className="hint">
            用户/角色消息正文、输入框内文字，以及聊天区以外的系统界面文字。
          </p>
          <div className="bubble-color-grid">
            {CHAT_THEME_TEXT_COLOR_FIELDS.map(({ key, label }) => (
              <ColorPickerField
                key={key}
                label={label}
                color={theme[key] as string}
                onChange={(next) =>
                  onChange({
                    ...theme,
                    ...(next.color ? { [key]: next.color } : {}),
                  })
                }
              />
            ))}
          </div>
        </div>
      </SettingsFold>

      <SettingsFold title="字体调整">
        <div className="decorate-section">
          <EncoreBlockTitle as="h3" icon={<FontSizeOutlined />} color="#60a5fa">
            聊天字体
          </EncoreBlockTitle>
          <p className="hint">仅作用于聊天区：你与角色的消息正文，以及内心戏 / 思维链。</p>
          <div className="chat-decorate-grid">
            {CHAT_FONT_SIZE_FIELDS.map(({ key, label, options }) => (
              <label key={key} className="chat-decorate-field">
                <span>{label}</span>
                <select
                  value={theme[key]}
                  onChange={(e) => onChange({ ...theme, [key]: Number(e.target.value) })}
                >
                  {options.map((size) => (
                    <option key={size} value={size}>
                      {size}px
                      {key === "messageFontSize" && size === 16 ? "（默认）" : ""}
                      {key === "messageFontSize" && size >= 20 ? " · 较大" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="decorate-section">
          <EncoreBlockTitle as="h3" icon={<FontSizeOutlined />} color="#2dd4bf">
            系统字体
          </EncoreBlockTitle>
          <p className="hint">
            聊天区以外的可见文字：提示与徽章、侧栏与按钮、提示词分析面板、系统提示词块等。
          </p>
          <div className="chat-decorate-grid">
            {SYSTEM_FONT_SIZE_FIELDS.map(({ key, label, options }) => (
              <label key={key} className="chat-decorate-field">
                <span>{label}</span>
                <select
                  value={theme[key]}
                  onChange={(e) => onChange({ ...theme, [key]: Number(e.target.value) })}
                >
                  {options.map((size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      </SettingsFold>

      {hint && <p className="hint decorate-hint">{hint}</p>}

      <button type="button" className="btn btn-outline decorate-save" onClick={onSave}>
        保存
      </button>
    </div>
  );
}
