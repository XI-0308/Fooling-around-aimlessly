"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import {
  Actions,
  Attachments,
  Bubble,
  Conversations,
  Prompts,
  Sender,
  Think,
  ThoughtChain,
  Welcome,
} from "@ant-design/x";
import {
  BulbOutlined,
  CopyOutlined,
  EditOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import "./antx.css";

const DEMO_CONVERSATIONS = [
  { key: "1", label: "与林晚的聊天", timestamp: Date.now() - 3600000 },
  { key: "2", label: "测试对话", timestamp: Date.now() - 86400000 },
];

const DEMO_PROMPTS = [
  { key: "p1", label: "继续昨晚的剧情", description: "从上次停下的地方接着聊" },
  { key: "p2", label: "换种语气", description: "让角色更温柔一点" },
];

function Section({
  name,
  desc,
  children,
}: {
  name: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="antx-section">
      <h2 className="antx-section-title">
        <span className="antx-component-name">{name}</span>
      </h2>
      <p className="antx-section-desc">{desc}</p>
      <div className="antx-demo">{children}</div>
    </section>
  );
}

export default function AntxShowcasePage() {
  const [senderValue, setSenderValue] = useState("");

  return (
    <AppShell title="Ant Design X">
      <div className="page-scroll antx-page">
        <p className="antx-intro">
          对照官网{" "}
          <a href="https://x.ant.design/components/overview" target="_blank" rel="noreferrer">
            x.ant.design
          </a>{" "}
          的组件名，告诉我你喜欢哪一块（例如「Bubble 用 round + outlined」「Sender 带附件槽」）。聊天页已接入{" "}
          <strong>ThoughtChain</strong> 显示思维链；其余组件在此预览。
        </p>

        <Section name="Bubble" desc="单条气泡，可配置 variant（filled / outlined / shadow）与 shape（default / round / corner）。">
          <div className="antx-demo-row">
            <Bubble content="filled · default" placement="start" />
            <Bubble content="filled · round" placement="start" shape="round" />
            <Bubble content="outlined" placement="start" variant="outlined" />
            <Bubble content="用户消息" placement="end" />
          </div>
        </Section>

        <Section name="Bubble.List" desc="消息列表容器，role 可分别配置 user / ai 样式。">
          <div className="antx-bubble-list-wrap">
            <Bubble.List
              items={[
                { key: "1", role: "ai", content: "你好，我是 Encore Flow 里的角色。" },
                { key: "2", role: "user", content: "这是用户侧气泡。" },
                {
                  key: "3",
                  role: "ai",
                  content: "支持 markdown、附件、音乐卡片等都可以嵌在 content 里。",
                },
              ]}
              role={{
                ai: { placement: "start", variant: "filled", shape: "round" },
                user: { placement: "end", variant: "filled", shape: "round" },
              }}
            />
          </div>
        </Section>

        <Section name="ThoughtChain" desc="思维链 / 推理过程展示，聊天页 reasoner 模型已使用此组件。">
          <ThoughtChain
            items={[
              {
                key: "t1",
                title: "分析用户意图",
                description: "识别是否在点歌",
                content: "用户提到「卢广仲」，触发音乐检索。",
                status: "success",
                collapsible: true,
              },
              {
                key: "t2",
                title: "组织回复",
                status: "loading",
                blink: true,
                collapsible: true,
              },
            ]}
            defaultExpandedKeys={["t1", "t2"]}
          />
        </Section>

        <Section name="Think" desc="轻量「思考中」占位，适合流式等待。">
          <Think title="思考中" loading blink>
            正在检索记忆库与 LEANN 向量…
          </Think>
        </Section>

        <Section name="Sender" desc="输入框 + 发送区，可扩展 prefix / footer 插槽（附件、引用记忆等）。">
          <Sender
            value={senderValue}
            onChange={setSenderValue}
            placeholder="输入消息…（此为预览，不会真正发送）"
            prefix={<PaperClipOutlined />}
            onSubmit={(msg) => {
              setSenderValue("");
              void msg;
            }}
          />
        </Section>

        <Section name="Welcome" desc="空聊天页欢迎区。">
          <Welcome
            icon={<UserOutlined />}
            title="Encore Flow"
            description="选一位角色开始对话，或从左侧继续历史聊天。"
          />
        </Section>

        <Section name="Prompts" desc="快捷提示词 / 建议操作。">
          <Prompts title="你可以试试" items={DEMO_PROMPTS} />
        </Section>

        <Section name="Conversations" desc="会话列表侧栏样式。">
          <div style={{ maxWidth: 280 }}>
            <Conversations items={DEMO_CONVERSATIONS} defaultActiveKey="1" />
          </div>
        </Section>

        <Section name="Attachments" desc="附件上传与预览。">
          <Attachments
            beforeUpload={() => false}
            placeholder={{
              title: "点击或拖拽文件到此处",
              description: "支持图片、PDF 等（预览用，不会上传）",
            }}
          />
        </Section>

        <Section name="Actions" desc="消息下方操作按钮组（复制、编辑、重新生成等）。">
          <Actions
            items={[
              { key: "copy", icon: <CopyOutlined />, label: "复制" },
              { key: "edit", icon: <EditOutlined />, label: "编辑" },
              { key: "reload", icon: <ReloadOutlined />, label: "重新生成" },
            ]}
          />
          <Actions items={[{ key: "tip", icon: <BulbOutlined />, label: "提示词分析" }]} />
        </Section>
      </div>
    </AppShell>
  );
}
