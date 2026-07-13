import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { screen, within } from 'shadow-dom-testing-library';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { NextIntlClientProvider } from 'next-intl';
import { makeStore } from '@/shared/store/index';
import { StructuredComposer } from './StructuredComposer';

const messages = {
  gateway: {
    console: {
      structured: {
        actionLabel: 'Action',
        callsignLabel: 'Callsign',
        selectPlaceholder: 'Select…',
        send: 'Send',
        sendFailed: 'Sending failed — try again.',
        altitudeMode: {
          feet: 'Feet mode',
          special: 'Special mode',
        },
        fields: {
          filter: 'Filter',
          altitude: 'Altitude',
          feet: 'Feet',
          special: 'Special',
          degrees: 'Degrees',
          knots: 'Knots',
          mach: 'Mach',
          feetPerMinute: 'Feet per minute',
          code: 'Squawk code',
          point: 'Direct-to point',
          text: 'Scratchpad text',
          state: 'Ground state',
          sid: 'SID',
          star: 'STAR',
          controller: 'Target controller',
          message: 'Message',
        },
        errors: {
          required: '{field} is required.',
          invalidNumber: '{field} must be a number.',
        },
      },
    },
  },
};

function wrap(ui: React.ReactElement) {
  return (
    <Provider store={makeStore()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {ui}
      </NextIntlClientProvider>
    </Provider>
  );
}

async function lastRequestBody(fetchSpy: ReturnType<typeof vi.spyOn>) {
  const call = fetchSpy.mock.calls.at(-1);
  // fetchBaseQuery (RTK Query) invokes `fetch(new Request(...))` — a single
  // Request argument, not the classic `fetch(url, init)` pair — so the JSON
  // body has to be read off the Request itself.
  const request = call?.[0] as Request;
  return request.clone().json();
}

afterEach(() => {
  vi.restoreAllMocks();
});

function stubFetch() {
  return vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ queued: { type: 'command', action: 'ping' } }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('StructuredComposer', () => {
  it('sends set_squawk with callsign and code payload (happy)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'set_squawk',
    );
    await userEvent.type(await screen.findByShadowLabelText('Callsign'), 'ABC1234');
    await userEvent.type(await screen.findByShadowLabelText('Squawk code'), '2354');
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    expect(fetchSpy).toHaveBeenCalled();
    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({
      action: 'set_squawk',
      callsign: 'ABC1234',
      payload: { code: '2354' },
    });
  });

  it('sends ping with no callsign field rendered and no payload key (happy)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    // ping is the default selected action.
    expect(screen.queryByShadowLabelText('Callsign')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    expect(fetchSpy).toHaveBeenCalled();
    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({ action: 'ping' });
    expect(body).not.toHaveProperty('payload');
    expect(body).not.toHaveProperty('callsign');
  });

  it('sends list_flights with an empty filter and no payload key (garbage)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'list_flights',
    );
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({ action: 'list_flights' });
    expect(body).not.toHaveProperty('payload');
  });

  it('sends set_cleared_altitude in special mode with exactly one key (happy)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'set_cleared_altitude',
    );
    await userEvent.type(await screen.findByShadowLabelText('Callsign'), 'ABC1234');
    await userEvent.click(screen.getByText('Special mode'));
    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Special' }),
      'clear',
    );
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({
      action: 'set_cleared_altitude',
      callsign: 'ABC1234',
      payload: { special: 'clear' },
    });
    expect(body.payload).not.toHaveProperty('feet');
  });

  it('sends set_cleared_altitude in feet mode with an actual number, not a string (happy)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'set_cleared_altitude',
    );
    await userEvent.type(await screen.findByShadowLabelText('Callsign'), 'ABC1234');
    // feet mode is the default.
    await userEvent.type(await screen.findByShadowLabelText('Feet'), '4000');
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({
      action: 'set_cleared_altitude',
      callsign: 'ABC1234',
      payload: { feet: 4000 },
    });
    expect(typeof body.payload.feet).toBe('number');
    expect(body.payload).not.toHaveProperty('special');
  });

  it('renders no callsign input for send_frequency_message and omits callsign from the envelope (happy)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'send_frequency_message',
    );
    expect(screen.queryByShadowLabelText('Callsign')).not.toBeInTheDocument();

    await userEvent.type(await screen.findByShadowLabelText('Message'), 'Traffic advisory');
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({
      action: 'send_frequency_message',
      payload: { message: 'Traffic advisory' },
    });
    expect(body).not.toHaveProperty('callsign');
  });

  it('renders set_ground_state as a dropdown with all 10 options, defaulted to the first, and sends the choice (happy)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'set_ground_state',
    );
    await userEvent.type(await screen.findByShadowLabelText('Callsign'), 'ABC1234');

    const stateSelect = await screen.findByShadowRole('combobox', { name: 'Ground state' });
    const optionValues = within(stateSelect)
      .getAllByShadowRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(optionValues).toEqual([
      'NSTS',
      'STUP',
      'PUSH',
      'TAXI',
      'DEPA',
      'TXIN',
      'PARK',
      'CLEA',
      'NOTC',
      'ARR',
    ]);

    await userEvent.selectOptions(stateSelect, 'PUSH');
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({
      action: 'set_ground_state',
      callsign: 'ABC1234',
      payload: { state: 'PUSH' },
    });
  });

  it('defaults set_ground_state to its first option when untouched (happy)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'set_ground_state',
    );
    await userEvent.type(await screen.findByShadowLabelText('Callsign'), 'ABC1234');
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({
      action: 'set_ground_state',
      callsign: 'ABC1234',
      payload: { state: 'NSTS' },
    });
  });

  it('defaults the altitude special select to its first option when untouched (happy)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'set_cleared_altitude',
    );
    await userEvent.type(await screen.findByShadowLabelText('Callsign'), 'ABC1234');
    await userEvent.click(screen.getByText('Special mode'));
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({
      action: 'set_cleared_altitude',
      callsign: 'ABC1234',
      payload: { special: 'ils' },
    });
  });

  it('sends list_controllers with an empty filter and no payload key (garbage)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'list_controllers',
    );
    expect(screen.queryByShadowLabelText('Callsign')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({ action: 'list_controllers' });
    expect(body).not.toHaveProperty('payload');
  });

  it('sends assume with a callsign and no payload key (happy)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'assume',
    );
    await userEvent.type(await screen.findByShadowLabelText('Callsign'), 'ABC1234');
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({ action: 'assume', callsign: 'ABC1234' });
    expect(body).not.toHaveProperty('payload');
  });

  it('sends transfer with callsign and controller payload (happy)', async () => {
    const fetchSpy = stubFetch();
    render(wrap(<StructuredComposer />));

    await userEvent.selectOptions(
      await screen.findByShadowRole('combobox', { name: 'Action' }),
      'transfer',
    );
    await userEvent.type(await screen.findByShadowLabelText('Callsign'), 'ABC1234');
    await userEvent.type(await screen.findByShadowLabelText('Target controller'), 'EDDM_TWR');
    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    const body = await lastRequestBody(fetchSpy);
    expect(body).toEqual({
      action: 'transfer',
      callsign: 'ABC1234',
      payload: { controller: 'EDDM_TWR' },
    });
  });

  it('surfaces a server failure (garbage)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    render(wrap(<StructuredComposer />));

    await userEvent.click(await screen.findByShadowRole('button', { name: 'Send' }));

    expect(await screen.findByShadowText('Sending failed — try again.')).toBeInTheDocument();
  });
});
