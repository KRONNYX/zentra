-- Zentra atomic workflow RPCs.
-- Run this after the main schema/RLS script.

create or replace function public.close_business_day(
  p_bar_id uuid,
  p_business_date date,
  p_cash_sales numeric,
  p_mpesa_sales numeric,
  p_notes text default null,
  p_ledger_photo_path text default null,
  p_credits jsonb default '[]'::jsonb,
  p_settled_bills jsonb default '[]'::jsonb,
  p_expenses jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_credit jsonb;
  v_settlement jsonb;
  v_expense jsonb;
  v_credit_total numeric := 0;
  v_settled_cash_total numeric := 0;
  v_settled_mpesa_total numeric := 0;
  v_expense_total numeric := 0;
  v_revenue_total numeric := 0;
  v_submission_id uuid;
  v_expected_amount numeric;
  v_payment_method text;
  v_settled_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'User not authenticated.';
  end if;

  if p_bar_id is null or (
    p_bar_id <> public.get_current_bar_id()
    and not public.is_current_user_super_user()
  ) then
    raise exception 'No bar selected.';
  end if;

  if not public.current_user_has_role(array['owner', 'manager', 'super_user']) then
    raise exception 'You do not have permission to close a business day.';
  end if;

  if p_business_date is null then
    raise exception 'Choose a business date before closing the day.';
  end if;

  if exists (
    select 1
    from public.close_day_submissions
    where bar_id = p_bar_id
      and business_date = p_business_date
  ) then
    raise exception 'This trading day has already been closed.';
  end if;

  for v_settlement in select * from jsonb_array_elements(coalesce(p_settled_bills, '[]'::jsonb))
  loop
    v_payment_method := lower(coalesce(v_settlement ->> 'paymentMethod', ''));

    if v_payment_method not in ('cash', 'mpesa') then
      raise exception 'Invalid bill settlement payment method.';
    end if;

    select amount
    into v_expected_amount
    from public.customer_credits
    where id = (v_settlement ->> 'id')::uuid
      and bar_id = p_bar_id
      and status = 'unpaid'
    for update;

    if v_expected_amount is null then
      raise exception 'One or more bills were already settled. Refresh and try again.';
    end if;

    if v_expected_amount <> coalesce((v_settlement ->> 'amount')::numeric, -1) then
      raise exception 'One or more bills were changed. Refresh and try again.';
    end if;

    if v_payment_method = 'cash' then
      v_settled_cash_total := v_settled_cash_total + v_expected_amount;
    else
      v_settled_mpesa_total := v_settled_mpesa_total + v_expected_amount;
    end if;
  end loop;

  insert into public.close_day_submissions (
    bar_id,
    business_date,
    cash_sales,
    mpesa_sales,
    notes,
    ledger_photo_path,
    submitted_by
  )
  values (
    p_bar_id,
    p_business_date,
    coalesce(p_cash_sales, 0),
    coalesce(p_mpesa_sales, 0),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_ledger_photo_path, '')), ''),
    v_user_id
  )
  returning id into v_submission_id;

  for v_credit in select * from jsonb_array_elements(coalesce(p_credits, '[]'::jsonb))
  loop
    if nullif(trim(coalesce(v_credit ->> 'staffName', '')), '') is not null
      and nullif(trim(coalesce(v_credit ->> 'customerName', '')), '') is not null
      and coalesce((v_credit ->> 'amount')::numeric, 0) > 0 then
      v_credit_total := v_credit_total + (v_credit ->> 'amount')::numeric;

      insert into public.customer_credits (
        bar_id,
        business_date,
        billing_month,
        customer_name,
        amount,
        staff_name,
        staff_id,
        notes,
        status,
        created_by
      )
      values (
        p_bar_id,
        p_business_date,
        date_trunc('month', p_business_date)::date,
        trim(v_credit ->> 'customerName'),
        (v_credit ->> 'amount')::numeric,
        trim(v_credit ->> 'staffName'),
        case
          when nullif(trim(coalesce(v_credit ->> 'staffId', '')), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then nullif(trim(coalesce(v_credit ->> 'staffId', '')), '')::uuid
          else null::uuid
        end,
        nullif(trim(coalesce(v_credit ->> 'notes', '')), ''),
        'unpaid',
        v_user_id
      );
    end if;
  end loop;

  for v_settlement in select * from jsonb_array_elements(coalesce(p_settled_bills, '[]'::jsonb))
  loop
    update public.customer_credits
    set status = 'settled',
        settled_at = now(),
        settled_business_date = p_business_date,
        settled_by = v_user_id
    where id = (v_settlement ->> 'id')::uuid
      and bar_id = p_bar_id
      and status = 'unpaid';

    if not found then
      raise exception 'One or more bills were already settled. Refresh and try again.';
    end if;

    v_settled_count := v_settled_count + 1;
  end loop;

  for v_expense in select * from jsonb_array_elements(coalesce(p_expenses, '[]'::jsonb))
  loop
    if nullif(trim(coalesce(v_expense ->> 'expenseType', '')), '') is not null
      and coalesce((v_expense ->> 'amount')::numeric, 0) > 0 then
      v_expense_total := v_expense_total + (v_expense ->> 'amount')::numeric;

      insert into public.expenses (
        bar_id,
        business_date,
        expense_type,
        description,
        amount,
        created_by
      )
      values (
        p_bar_id,
        p_business_date,
        trim(v_expense ->> 'expenseType'),
        nullif(trim(coalesce(v_expense ->> 'description', '')), ''),
        (v_expense ->> 'amount')::numeric,
        v_user_id
      );
    end if;
  end loop;

  v_revenue_total :=
    coalesce(p_cash_sales, 0) +
    coalesce(p_mpesa_sales, 0) +
    v_settled_cash_total +
    v_settled_mpesa_total +
    v_credit_total;

  insert into public.daily_sales (
    bar_id,
    business_date,
    revenue_total,
    cash_total,
    mpesa_total
  )
  values (
    p_bar_id,
    p_business_date,
    v_revenue_total,
    coalesce(p_cash_sales, 0) + v_settled_cash_total,
    coalesce(p_mpesa_sales, 0) + v_settled_mpesa_total
  )
  on conflict (bar_id, business_date)
  do update set
    revenue_total = excluded.revenue_total,
    cash_total = excluded.cash_total,
    mpesa_total = excluded.mpesa_total;

  if nullif(trim(coalesce(p_notes, '')), '') is not null then
    insert into public.bar_alerts (bar_id, severity, message)
    values (p_bar_id, 'info', trim(p_notes));
  end if;

  insert into public.intelligence_insights (
    bar_id,
    insight_type,
    insight_text,
    severity,
    created_by
  )
  values (
    p_bar_id,
    'daily_closure',
    concat_ws(
      chr(10),
      'Revenue: KES ' || v_revenue_total,
      'Expenses: KES ' || v_expense_total,
      'Bills: KES ' || v_credit_total,
      'Settled Bills: ' || v_settled_count,
      'Settled Bills Cash: KES ' || v_settled_cash_total,
      'Settled Bills M-Pesa: KES ' || v_settled_mpesa_total
    ),
    'info',
    v_user_id
  );

  insert into public.audit_logs (
    bar_id,
    user_id,
    action,
    entity_type,
    new_values
  )
  values (
    p_bar_id,
    case
      when exists (select 1 from public.users where id = v_user_id) then v_user_id
      else null::uuid
    end,
    'daily_closure',
    'daily_closure',
    jsonb_build_object(
      'actorUserId', v_user_id,
      'businessDate', p_business_date,
      'submissionId', v_submission_id,
      'revenueTotal', v_revenue_total,
      'creditTotal', v_credit_total,
      'settledBills', v_settled_count,
      'settledCashTotal', v_settled_cash_total,
      'settledMpesaTotal', v_settled_mpesa_total,
      'expenseTotal', v_expense_total
    )
  );

  return jsonb_build_object(
    'submissionId', v_submission_id,
    'businessDate', p_business_date,
    'revenueTotal', v_revenue_total,
    'cashTotal', coalesce(p_cash_sales, 0) + v_settled_cash_total,
    'mpesaTotal', coalesce(p_mpesa_sales, 0) + v_settled_mpesa_total,
    'creditTotal', v_credit_total,
    'settledBills', v_settled_count,
    'expenseTotal', v_expense_total
  );
exception
  when unique_violation then
    raise exception 'This trading day has already been closed.';
end;
$$;

create or replace function public.save_inventory_update(
  p_bar_id uuid,
  p_business_date date,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product_id uuid;
  v_inventory_id uuid;
  v_product_name text;
  v_opening_stock numeric;
  v_purchased_stock numeric;
  v_closing_stock numeric;
  v_units_sold numeric;
  v_selling_price numeric;
  v_cost_price numeric;
  v_previous record;
  v_had_previous boolean;
  v_previous_purchased numeric;
  v_previous_sold numeric;
  v_previous_closing numeric;
  v_last_counted date;
  v_purchased_delta numeric;
  v_sold_delta numeric;
  v_adjustment_delta numeric;
  v_products_updated integer := 0;
  v_movements_created integer := 0;
  v_units_sold_total numeric := 0;
  v_existing_rows integer := 0;
begin
  if v_user_id is null then
    raise exception 'User not authenticated.';
  end if;

  if p_bar_id is null or (
    p_bar_id <> public.get_current_bar_id()
    and not public.is_current_user_super_user()
  ) then
    raise exception 'No bar selected.';
  end if;

  if not public.current_user_has_role(array['owner', 'manager', 'super_user']) then
    raise exception 'You do not have permission to update inventory.';
  end if;

  if p_business_date is null then
    raise exception 'Choose a business date before saving inventory.';
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'No inventory rows are available to save.';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_product_id := (v_item ->> 'productId')::uuid;

    select max(last_counted_at::date)
    into v_last_counted
    from public.inventory
    where bar_id = p_bar_id
      and product_id = v_product_id;

    if v_last_counted is not null and v_last_counted > p_business_date then
      raise exception 'A newer inventory count already exists.';
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_product_id := (v_item ->> 'productId')::uuid;
    v_inventory_id := nullif(v_item ->> 'inventoryId', '')::uuid;
    v_product_name := trim(coalesce(v_item ->> 'productName', 'Inventory item'));
    v_opening_stock := greatest(coalesce((v_item ->> 'openingStock')::numeric, 0), 0);
    v_purchased_stock := greatest(coalesce((v_item ->> 'purchasedStock')::numeric, 0), 0);
    v_closing_stock := greatest(coalesce((v_item ->> 'closingStock')::numeric, 0), 0);
    v_units_sold := greatest(v_opening_stock + v_purchased_stock - v_closing_stock, 0);
    v_selling_price := greatest(coalesce((v_item ->> 'sellingPrice')::numeric, 0), 0);
    v_cost_price := greatest(coalesce((v_item ->> 'costPrice')::numeric, 0), 0);

    select *
    into v_previous
    from public.daily_product_closures
    where bar_id = p_bar_id
      and business_date = p_business_date
      and product_id = v_product_id
    limit 1;

    v_had_previous := found;
    v_previous_purchased := case when v_had_previous then coalesce(v_previous.purchased_stock, 0) else 0 end;
    v_previous_sold := case when v_had_previous then coalesce(v_previous.units_sold, 0) else 0 end;
    v_previous_closing := case when v_had_previous then coalesce(v_previous.closing_stock, 0) else 0 end;

    if v_had_previous then
      v_existing_rows := v_existing_rows + 1;
    end if;

    delete from public.daily_product_closures
    where bar_id = p_bar_id
      and business_date = p_business_date
      and product_id = v_product_id;

    insert into public.daily_product_closures (
      bar_id,
      business_date,
      product_id,
      product_name,
      opening_stock,
      purchased_stock,
      closing_stock,
      units_sold,
      created_by
    )
    values (
      p_bar_id,
      p_business_date,
      v_product_id,
      v_product_name,
      v_opening_stock,
      v_purchased_stock,
      v_closing_stock,
      v_units_sold,
      v_user_id
    );

    if v_inventory_id is not null then
      update public.inventory
      set name = v_product_name,
          opening_stock = v_opening_stock,
          current_stock = v_closing_stock,
          quantity = v_closing_stock,
          purchase_price = v_cost_price,
          selling_price = v_selling_price,
          last_counted_at = p_business_date::timestamptz,
          updated_at = now()
      where id = v_inventory_id
        and bar_id = p_bar_id;
    else
      update public.inventory
      set name = v_product_name,
          opening_stock = v_opening_stock,
          current_stock = v_closing_stock,
          quantity = v_closing_stock,
          purchase_price = v_cost_price,
          selling_price = v_selling_price,
          last_counted_at = p_business_date::timestamptz,
          updated_at = now()
      where product_id = v_product_id
        and bar_id = p_bar_id;

      if found then
        select id
        into v_inventory_id
        from public.inventory
        where product_id = v_product_id
          and bar_id = p_bar_id
        limit 1;
      end if;
    end if;

    if not found then
      insert into public.inventory (
        bar_id,
        product_id,
        name,
        opening_stock,
        current_stock,
        quantity,
        purchase_price,
        selling_price,
        last_counted_at,
        updated_at
      )
      values (
        p_bar_id,
        v_product_id,
        v_product_name,
        v_opening_stock,
        v_closing_stock,
        v_closing_stock,
        v_cost_price,
        v_selling_price,
        p_business_date::timestamptz,
        now()
      )
      returning id into v_inventory_id;
    end if;

    v_purchased_delta := v_purchased_stock - v_previous_purchased;
    v_sold_delta := v_units_sold - v_previous_sold;
    v_adjustment_delta :=
      case
        when not v_had_previous then 0
        else v_closing_stock - v_previous_closing - v_purchased_delta + v_sold_delta
      end;

    if v_purchased_delta <> 0 then
      insert into public.inventory_movements (
        bar_id,
        inventory_id,
        product_name,
        movement_type,
        quantity_change,
        quantity
      )
      values (
        p_bar_id,
        v_inventory_id,
        v_product_name,
        'restock',
        v_purchased_delta,
        abs(v_purchased_delta)
      );
      v_movements_created := v_movements_created + 1;
    end if;

    if v_sold_delta <> 0 then
      insert into public.inventory_movements (
        bar_id,
        inventory_id,
        product_name,
        movement_type,
        quantity_change,
        quantity
      )
      values (
        p_bar_id,
        v_inventory_id,
        v_product_name,
        'sale',
        -v_sold_delta,
        abs(v_sold_delta)
      );
      v_movements_created := v_movements_created + 1;
    end if;

    if v_adjustment_delta <> 0 then
      insert into public.inventory_movements (
        bar_id,
        inventory_id,
        product_name,
        movement_type,
        quantity_change,
        quantity
      )
      values (
        p_bar_id,
        v_inventory_id,
        v_product_name,
        'adjustment',
        v_adjustment_delta,
        abs(v_adjustment_delta)
      );
      v_movements_created := v_movements_created + 1;
    end if;

    v_products_updated := v_products_updated + 1;
    v_units_sold_total := v_units_sold_total + v_units_sold;
  end loop;

  delete from public.product_sales
  where bar_id = p_bar_id
    and business_date = p_business_date;

  insert into public.product_sales (
    bar_id,
    business_date,
    product_name,
    units_sold
  )
  select
    bar_id,
    business_date,
    coalesce(product_name, 'Unnamed product'),
    round(sum(units_sold))::integer
  from public.daily_product_closures
  where bar_id = p_bar_id
    and business_date = p_business_date
    and units_sold > 0
  group by bar_id, business_date, product_name;

  insert into public.audit_logs (
    bar_id,
    user_id,
    action,
    entity_type,
    new_values
  )
  values (
    p_bar_id,
    case
      when exists (select 1 from public.users where id = v_user_id) then v_user_id
      else null::uuid
    end,
    'inventory_update',
    'inventory',
    jsonb_build_object(
      'actorUserId', v_user_id,
      'businessDate', p_business_date,
      'productsUpdated', v_products_updated,
      'movementsCreated', v_movements_created,
      'unitsSold', v_units_sold_total,
      'editedExistingRows', v_existing_rows
    )
  );

  return jsonb_build_object(
    'businessDate', p_business_date,
    'productsUpdated', v_products_updated,
    'movementsCreated', v_movements_created,
    'unitsSold', v_units_sold_total,
    'editedExistingRows', v_existing_rows
  );
end;
$$;

grant execute on function public.close_business_day(uuid, date, numeric, numeric, text, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.save_inventory_update(uuid, date, jsonb) to authenticated;
