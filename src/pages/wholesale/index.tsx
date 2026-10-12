import { useShow, useUpdate, type CrudFilter } from "@refinedev/core";
import { List, Show, useTable } from "@refinedev/antd";
import { Alert, Button, Card, Descriptions, Empty, Form, Input, List as AntList, Popconfirm, Segmented, Space, Table, Tag, Typography } from "antd";
import { Link } from "react-router";
import type { WholesaleRequest, WholesaleStatus } from "../../types";
import { WHOLESALE_STATUS, dateTime } from "../../lib/format";

const QUEUE: CrudFilter = { field: "status", operator: "in", value: ["pending", "documents_requested"] };
const StatusTag = ({ s }: { s: WholesaleStatus }) => <Tag color={WHOLESALE_STATUS[s].color}>{WHOLESALE_STATUS[s].label}</Tag>;
const size = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} КБ` : `${(b / 1024 / 1024).toFixed(1)} МБ`);

export const WholesaleList = () => {
  const { tableProps, filters, setFilters } = useTable<WholesaleRequest>({
    filters: { initial: [QUEUE] },
    sorters: { initial: [{ field: "submittedAt", order: "asc" }] },
  });
  const view = filters.some((f) => "field" in f && f.field === "status") ? "queue" : "all";

  return (
    <List>
      <Segmented
        style={{ marginBottom: 16 }}
        value={view}
        onChange={(v) => setFilters(v === "queue" ? [QUEUE] : [], "replace")}
        options={[{ value: "queue", label: "Очередь" }, { value: "all", label: "Все заявки" }]}
      />
      <Table {...tableProps} rowKey="id" size="small" scroll={{ x: true }}>
        <Table.Column<WholesaleRequest> dataIndex="orgName" title="Организация" render={(v, r) => <Link to={`/wholesale/${r.id}`}>{v}</Link>} />
        <Table.Column dataIndex="bin" title="БИН/ИИН" />
        <Table.Column dataIndex="contactPerson" title="Контакт" />
        <Table.Column dataIndex="phone" title="Телефон" render={(v) => <span style={{ whiteSpace: "nowrap" }}>{v}</span>} />
        <Table.Column<WholesaleRequest> dataIndex="documents" title="Документов" align="right" render={(d: unknown[]) => d.length} />
        <Table.Column<WholesaleRequest> dataIndex="status" title="Статус" render={(s: WholesaleStatus) => <StatusTag s={s} />} />
        <Table.Column dataIndex="submittedAt" title="Подана" sorter render={dateTime} />
      </Table>
    </List>
  );
};

type Decision = Exclude<WholesaleStatus, "pending">;

export const WholesaleShow = () => {
  const { result: r, query } = useShow<WholesaleRequest>();
  const { mutateAsync, mutation: { isPending } } = useUpdate();
  const [form] = Form.useForm<{ commentToCustomer: string; internalNote: string }>();

  const decide = async (status: Decision) => {
    if (!r) return;
    const { commentToCustomer = "", internalNote = "" } = form.getFieldsValue();
    if (status !== "approved" && !commentToCustomer.trim()) {
      form.setFields([{ name: "commentToCustomer", errors: ["Напишите клиенту, что нужно сделать — он увидит это в приложении"] }]);
      return;
    }
    // ponytail: two calls in the mock; the backend (B6) does this in one transaction on PATCH /wholesale-requests/:id.
    await mutateAsync({
      resource: "customers",
      id: r.customerId,
      values: status === "approved"
        ? { wholesaleStatus: status, mode: "wholesale", orgName: r.orgName, bin: r.bin }
        : { wholesaleStatus: status, ...(status === "rejected" && { mode: "retail" }) },
      successNotification: false,
    });
    await mutateAsync({
      resource: "wholesale_requests",
      id: r.id,
      values: { status, commentToCustomer: commentToCustomer.trim() || null, internalNote: internalNote.trim() || null },
      successNotification: {
        type: "success",
        message: `Заявка: ${WHOLESALE_STATUS[status].label.toLowerCase()}`,
        description: "Клиент получит push о решении",
      },
    });
  };

  return (
    <Show isLoading={query.isLoading} title={r?.orgName ?? "Заявка на опт"} canEdit={false}>
      {r && (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card size="small" title={<Space wrap>Заявка <StatusTag s={r.status} /></Space>}>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Организация">{r.orgName}</Descriptions.Item>
              <Descriptions.Item label="БИН/ИИН"><span className="num">{r.bin}</span></Descriptions.Item>
              <Descriptions.Item label="Адрес">{r.address}</Descriptions.Item>
              <Descriptions.Item label="Контактное лицо">{r.contactPerson}</Descriptions.Item>
              <Descriptions.Item label="Телефон">{r.phone}</Descriptions.Item>
              <Descriptions.Item label="Подана">{dateTime(r.submittedAt)}</Descriptions.Item>
              <Descriptions.Item label="Клиент"><Link to={`/customers/${r.customerId}`}>Открыть профиль</Link></Descriptions.Item>
            </Descriptions>
          </Card>

          <Card size="small" title={`Документы (${r.documents.length})`}>
            <AntList
              size="small"
              dataSource={r.documents}
              locale={{ emptyText: <Empty description="Документы не загружены" /> }}
              renderItem={(d) => (
                <AntList.Item actions={[
                  // In prod `url` is a short-lived signed link to the private bucket (B6); here it is a mock.
                  <a key="open" href={d.url} target="_blank" rel="noopener noreferrer">Открыть</a>,
                ]}>
                  <AntList.Item.Meta title={d.name} description={<span className="num">{size(d.sizeBytes)}</span>} />
                </AntList.Item>
              )}
            />
            <Typography.Text type="secondary">Ссылки временные и доступны только персоналу.</Typography.Text>
          </Card>

          <Card size="small" title="Решение">
            <Form
              form={form}
              layout="vertical"
              key={r.id + r.status}
              initialValues={{ commentToCustomer: r.commentToCustomer ?? "", internalNote: r.internalNote ?? "" }}
            >
              <Form.Item name="commentToCustomer" label="Комментарий клиенту" extra="Клиент увидит этот текст в приложении. Обязателен, если запрашиваете документы или отклоняете.">
                <Input.TextArea rows={2} maxLength={500} showCount />
              </Form.Item>
              <Form.Item name="internalNote" label="Внутренняя заметка" extra="Видна только персоналу, например «проверено на месте».">
                <Input.TextArea rows={2} maxLength={500} />
              </Form.Item>
              <Space wrap>
                <Button type="primary" loading={isPending} disabled={r.status === "approved"} onClick={() => decide("approved")}>Одобрить</Button>
                <Button loading={isPending} onClick={() => decide("documents_requested")}>Запросить документы</Button>
                <Popconfirm title="Отклонить заявку?" description="Клиент останется в рознице." okText="Отклонить" okButtonProps={{ danger: true }} onConfirm={() => decide("rejected")}>
                  <Button danger loading={isPending} disabled={r.status === "rejected"}>Отклонить</Button>
                </Popconfirm>
              </Space>
              <Alert style={{ marginTop: 12 }} type="info" showIcon message="Клиент получит push о решении. После одобрения оптовые цены открываются сразу." />
            </Form>
          </Card>
        </Space>
      )}
    </Show>
  );
};
