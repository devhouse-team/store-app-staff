import { DeleteButton, EditButton, List, useTable } from "@refinedev/antd";
import { useDelete, useList, useUpdateMany, type CrudFilter } from "@refinedev/core";
import { EyeInvisibleOutlined, EyeOutlined, FolderOutlined } from "@ant-design/icons";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, TreeSelect, Typography } from "antd";
import { useState } from "react";
import type { Category, Product } from "../../types";
import { tenge } from "../../lib/format";
import { catPath, categoryTreeData, descendantIds } from "../categories/tree";
import { VISIBILITY } from "./packs";

type Hidden = "all" | "visible" | "hidden";

export const ProductList = () => {
  const { result: catRes } = useList<Category>({ resource: "categories", pagination: { mode: "off" } });
  const cats = catRes.data;
  const { tableProps, setFilters } = useTable<Product>({ syncWithLocation: false, pagination: { pageSize: 20 } });
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string>();
  const [hidden, setHidden] = useState<Hidden>("all");
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState<string>();
  const { mutate: updateMany, mutation: bulk } = useUpdateMany<Product>();
  const { mutate: deleteOne } = useDelete();

  const apply = (next: { q?: string; categoryId?: string | null; hidden?: Hidden }) => {
    const s = { q, categoryId, hidden, ...next };
    const f: CrudFilter[] = [];
    if (s.q?.trim())
      f.push({
        operator: "or",
        value: ["name", "sku", "barcode"].map((field) => ({ field, operator: "contains" as const, value: s.q!.trim() })),
      });
    if (s.categoryId) f.push({ field: "categoryId", operator: "in", value: descendantIds(cats, s.categoryId) });
    if (s.hidden !== "all") f.push({ field: "hidden", operator: "eq", value: s.hidden === "hidden" });
    setFilters(f, "replace");
  };

  const bulkUpdate = (values: Partial<Product>, done?: () => void) =>
    updateMany(
      { resource: "products", ids: selected as string[], values, successNotification: { type: "success", message: `Обновлено товаров: ${selected.length}` } },
      { onSuccess: () => (setSelected([]), done?.()) },
    );

  return (
    <List createButtonProps={{ children: "Добавить товар" }}>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search
          aria-label="Поиск по названию, артикулу или штрихкоду"
          placeholder="Название, артикул, штрихкод"
          allowClear
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onSearch={(v) => apply({ q: v })}
          style={{ width: 280, maxWidth: "100%" }}
        />
        <TreeSelect
          aria-label="Категория"
          placeholder="Все категории"
          allowClear
          treeDefaultExpandAll
          treeData={categoryTreeData(cats)}
          value={categoryId}
          onChange={(v) => (setCategoryId(v), apply({ categoryId: v ?? null }))}
          style={{ width: 220, maxWidth: "100%" }}
        />
        <Select<Hidden>
          aria-label="Видимость"
          value={hidden}
          onChange={(v) => (setHidden(v), apply({ hidden: v }))}
          style={{ width: 160 }}
          options={[
            { value: "all", label: "Все товары" },
            { value: "visible", label: "Видимые" },
            { value: "hidden", label: "Скрытые" },
          ]}
        />
      </Space>

      {selected.length > 0 && (
        <Space wrap style={{ marginBottom: 12 }}>
          <Typography.Text>Выбрано: {selected.length}</Typography.Text>
          <Button icon={<EyeInvisibleOutlined />} loading={bulk.isPending} onClick={() => bulkUpdate({ hidden: true })}>
            Скрыть
          </Button>
          <Button icon={<EyeOutlined />} loading={bulk.isPending} onClick={() => bulkUpdate({ hidden: false })}>
            Показать
          </Button>
          <Button icon={<FolderOutlined />} onClick={() => setMoveOpen(true)}>
            Изменить категорию
          </Button>
          <Button type="link" onClick={() => setSelected([])}>
            Снять выбор
          </Button>
        </Space>
      )}

      <Table
        {...tableProps}
        rowKey="id"
        size="small"
        scroll={{ x: true }}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected, preserveSelectedRowKeys: true }}
        locale={{ emptyText: "Товары не найдены" }}
        columns={[
          {
            title: "Товар",
            dataIndex: "name",
            sorter: true,
            render: (name, p) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{name}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                  {[p.sku, p.barcode, p.brand].filter(Boolean).join(" · ")}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: "Категория",
            dataIndex: "categoryId",
            render: (id) => {
              const path = catPath(cats, id);
              return path ? <Tooltip title={path}><span style={{ whiteSpace: "nowrap" }}>{path.split(" / ").pop()}</span></Tooltip> : "—";
            },
          },
          {
            title: "Фасовки",
            dataIndex: "packs",
            render: (packs: Product["packs"]) => (
              <Space direction="vertical" size={0}>
                {packs.map((p) => (
                  <span key={p.id} style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {p.label} · {p.retailPrice != null && `розн. ${tenge(p.retailPrice)}`}
                    {p.retailPrice != null && p.wholesalePrice != null && " · "}
                    {p.wholesalePrice != null && `опт ${tenge(p.wholesalePrice)}`}{" "}
                    <Tag bordered={false}>{VISIBILITY[p.visibility]}</Tag>
                  </span>
                ))}
              </Space>
            ),
          },
          {
            title: "Признаки",
            key: "flags",
            render: (_, p) => (
              <Space size={[0, 4]} wrap>
                {p.isWeighed && <Tag color="blue">весовой</Tag>}
                {p.isPerishable && <Tag color="orange">скоропорт</Tag>}
                {p.preorderAllowed && <Tag color="gold">предзаказ</Tag>}
                {p.hidden && <Tag icon={<EyeInvisibleOutlined />}>скрыт</Tag>}
              </Space>
            ),
          },
          {
            title: "Действия",
            key: "actions",
            fixed: "right",
            render: (_, p) => (
              <Space>
                <Tooltip title="Изменить">
                  <EditButton hideText size="small" recordItemId={p.id} aria-label="Изменить" />
                </Tooltip>
                <Tooltip title="Удалить">
                  <DeleteButton
                    hideText
                    size="small"
                    recordItemId={p.id}
                    aria-label="Удалить"
                    confirmTitle={`Удалить «${p.name}»?`}
                    confirmOkText="Удалить"
                    confirmCancelText="Отмена"
                    onSuccess={() =>
                      deleteOne({ resource: "stock", id: p.id, successNotification: false, errorNotification: false })
                    }
                  />
                </Tooltip>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={`Изменить категорию (${selected.length})`}
        open={moveOpen}
        okText="Перенести"
        cancelText="Отмена"
        okButtonProps={{ disabled: !moveTo, loading: bulk.isPending }}
        onCancel={() => setMoveOpen(false)}
        onOk={() => bulkUpdate({ categoryId: moveTo }, () => (setMoveOpen(false), setMoveTo(undefined)))}
      >
        <Form layout="vertical">
          <Form.Item label="Новая категория" required>
            <TreeSelect treeData={categoryTreeData(cats)} treeDefaultExpandAll value={moveTo} onChange={setMoveTo} />
          </Form.Item>
        </Form>
      </Modal>
    </List>
  );
};
