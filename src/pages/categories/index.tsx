import { DeleteButton, List, useModalForm } from "@refinedev/antd";
import { useList } from "@refinedev/core";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Form, Input, Modal, Space, Table, Tooltip, TreeSelect } from "antd";
import type { FormProps, ModalProps } from "antd";
import type { Category, Product } from "../../types";
import { MAX_DEPTH, buildTree, depthOf, descendantIds, heightOf } from "./tree";

type Values = { name: string; parentId?: string | null };

const CategoryModal = ({
  modalProps,
  formProps,
  cats,
  editingId,
  title,
}: {
  title: string;
  modalProps: ModalProps;
  formProps: FormProps<Values>;
  cats: Category[];
  editingId?: string;
}) => {
  const own = editingId ? descendantIds(cats, editingId) : [];
  const height = editingId ? heightOf(cats, editingId) : 1;
  const treeData = buildTree(cats, (c) => ({
    value: c.id,
    title: c.name,
    // A parent can't be the category itself / its subtree, and the result must fit in MAX_DEPTH levels.
    disabled: own.includes(c.id) || depthOf(cats, c.id) + height > MAX_DEPTH,
  }));
  return (
    <Modal {...modalProps} title={title} okText={editingId ? "Сохранить" : "Создать"} cancelText="Отмена">
      <Form
        {...formProps}
        layout="vertical"
        onFinish={(v) => formProps.onFinish?.({ name: v.name.trim(), parentId: v.parentId ?? null })}
      >
        <Form.Item label="Название" name="name" rules={[{ required: true, whitespace: true, message: "Введите название" }]}>
          <Input maxLength={80} />
        </Form.Item>
        <Form.Item
          label="Родительская категория"
          name="parentId"
          extra={`Не более ${MAX_DEPTH} уровней вложенности. Пусто — категория верхнего уровня.`}
        >
          <TreeSelect treeData={treeData} allowClear treeDefaultExpandAll placeholder="Верхний уровень" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export const CategoryList = () => {
  const { result: catRes, query } = useList<Category>({ resource: "categories", pagination: { mode: "off" } });
  // ponytail: product counts computed client-side; backend should return productsCount per category.
  const { result: prodRes } = useList<Product>({ resource: "products", pagination: { mode: "off" } });
  const cats = catRes.data;
  const counts = new Map<string, number>();
  prodRes.data.forEach((p) => counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1));

  const create = useModalForm<Category, never, Values>({
    resource: "categories",
    action: "create",
    syncWithLocation: false,
  });
  const edit = useModalForm<Category, never, Values>({
    resource: "categories",
    action: "edit",
    syncWithLocation: false,
  });

  const rows = buildTree(cats, (c) => ({ ...c, key: c.id }));

  return (
    <List
      headerButtons={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => create.show()}>
          Добавить категорию
        </Button>
      }
    >
      <Table
        key={cats.length} // remount once data arrives so defaultExpandAllRows applies
        dataSource={rows}
        loading={query.isLoading}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: true }}
        expandable={{ defaultExpandAllRows: true }}
        locale={{ emptyText: "Категорий пока нет" }}
        columns={[
          { title: "Название", dataIndex: "name" },
          { title: "Уровень", key: "depth", width: 90, render: (_, c) => depthOf(cats, c.id) },
          { title: "Товаров", key: "count", width: 90, align: "right", render: (_, c) => counts.get(c.id) ?? 0 },
          {
            title: "Действия",
            key: "actions",
            width: 110,
            render: (_, c) => {
              const hasChildren = cats.some((x) => x.parentId === c.id);
              const n = counts.get(c.id) ?? 0;
              const blocked = hasChildren
                ? "Нельзя удалить: есть подкатегории"
                : n
                  ? `Нельзя удалить: в категории товаров — ${n}. Перенесите их в другую категорию.`
                  : null;
              return (
                <Space>
                  <Tooltip title="Изменить">
                    <Button size="small" icon={<EditOutlined />} aria-label="Изменить" onClick={() => edit.show(c.id)} />
                  </Tooltip>
                  {blocked ? (
                    <Tooltip title={blocked}>
                      <Button size="small" icon={<DeleteOutlined />} aria-label={blocked} disabled />
                    </Tooltip>
                  ) : (
                    <Tooltip title="Удалить">
                      <DeleteButton
                        resource="categories"
                        recordItemId={c.id}
                        size="small"
                        hideText
                        aria-label="Удалить"
                        confirmTitle={`Удалить категорию «${c.name}»?`}
                        confirmOkText="Удалить"
                        confirmCancelText="Отмена"
                      />
                    </Tooltip>
                  )}
                </Space>
              );
            },
          },
        ]}
      />
      <CategoryModal title="Новая категория" modalProps={create.modalProps} formProps={create.formProps} cats={cats} />
      <CategoryModal
        title="Изменить категорию"
        modalProps={edit.modalProps}
        formProps={edit.formProps}
        cats={cats}
        editingId={edit.id ? String(edit.id) : undefined}
      />
    </List>
  );
};
