import {Options} from "../src/Options";
import {DisyuntorConfig} from "../src/Config";

describe('Config', () => {
    describe('being instantiated from Options.Parameters', () => {
        let parameters: Options.Parameters;

        describe('invalid name', () => {
            //@ts-ignore
            parameters = {};

            it('should Error when name is not provided', () => {
                const invokeFromParameters = () => DisyuntorConfig.fromParameters(parameters);
                expect(invokeFromParameters).toThrowError('params.name is required');
            });
        });

        describe('valid name', () => {
            beforeEach(() => {
                parameters = {name: 'unit-test-params'};
            });

            it('Maps name input correctly', () => {
                const disyuntorConfig = DisyuntorConfig.fromParameters(parameters);
                expect(disyuntorConfig).toHaveProperty('name', 'unit-test-params');
            });

            it('Uses defaults for optional fields', () => {
                const disyuntorConfig = DisyuntorConfig.fromParameters(parameters);
                expect(disyuntorConfig.thresholdConfig.enforceCallTimeout).toEqual(true);
                expect(disyuntorConfig.thresholdConfig.callTimeoutMs).toEqual(2000);
                expect(disyuntorConfig.thresholdConfig.maxConsecutiveFailures).toEqual(5);
                expect(disyuntorConfig.thresholdConfig.minCooldownTimeMs).toEqual(15000);
                expect(disyuntorConfig.thresholdConfig.maxCooldownTimeMs).toEqual(30000);
                // TODO onTrip
                // TODO onClose
                // TODO trigger
            });

            it('should Error if true is given for timeout', () => {
                parameters.timeout = true;
                const invokeFromParameters = () => DisyuntorConfig.fromParameters(parameters);
                expect(invokeFromParameters).toThrowError('invalid timeout parameter. It should be either a timespan or false.');
            });

            describe('When false is given for timeout', () => {
                beforeEach(() => {
                    parameters.timeout = false;
                })

                it('should set enforceCallTimeout to false', () => {
                    const disyuntorConfig = DisyuntorConfig.fromParameters(parameters);
                    expect(disyuntorConfig.thresholdConfig.enforceCallTimeout).toEqual(false);
                });
            });

            describe('When a string value is given for timeout', () => {
                let disyuntorConfig: DisyuntorConfig;

                beforeEach(() => {
                    parameters.timeout = '5s';
                    disyuntorConfig = DisyuntorConfig.fromParameters(parameters);
                })

                it('should set enforceCallTimeout to true', () => {
                    expect(disyuntorConfig.thresholdConfig.enforceCallTimeout).toEqual(true);
                });

                it('should convert the string to a number', () => {
                    expect(disyuntorConfig.thresholdConfig.callTimeoutMs).toEqual(5000);
                });
            });

            describe('When a number value is given for timeout', () => {
                let disyuntorConfig: DisyuntorConfig;

                beforeEach(() => {
                    parameters.timeout = 1337;
                    disyuntorConfig = DisyuntorConfig.fromParameters(parameters);
                })

                it('should set enforceCallTimeout to true', () => {
                    expect(disyuntorConfig.thresholdConfig.enforceCallTimeout).toEqual(true);
                });

                it('should map the number as milliseconds', () => {
                    expect(disyuntorConfig.thresholdConfig.callTimeoutMs).toEqual(1337);
                });
            });

            it('Maps maxFailures input', () => {
                parameters.maxFailures = 100;
                const disyuntorConfig = DisyuntorConfig.fromParameters(parameters);
                expect(disyuntorConfig.thresholdConfig.maxConsecutiveFailures).toEqual(100);
            })

            describe('cooldown input', () => {
                it('maps a number as milliseconds', () => {
                    parameters.cooldown = 1337;
                    const disyuntorConfig = DisyuntorConfig.fromParameters(parameters);
                    expect(disyuntorConfig.thresholdConfig.minCooldownTimeMs).toEqual(1337);
                });

                it('converts the string to a number', () => {
                    parameters.cooldown = '42s';
                    const disyuntorConfig = DisyuntorConfig.fromParameters(parameters);
                    expect(disyuntorConfig.thresholdConfig.minCooldownTimeMs).toEqual(42000);
                });
            })

            describe('maxCooldown input', () => {
                it('maps a number as milliseconds', () => {
                    parameters.maxCooldown = 1337;
                    const disyuntorConfig = DisyuntorConfig.fromParameters(parameters);
                    expect(disyuntorConfig.thresholdConfig.maxCooldownTimeMs).toEqual(1337);
                });

                it('converts the string to a number', () => {
                    parameters.maxCooldown = '42s';
                    const disyuntorConfig = DisyuntorConfig.fromParameters(parameters);
                    expect(disyuntorConfig.thresholdConfig.maxCooldownTimeMs).toEqual(42000);
                });
            })
        });
    });

    // TODO tests for event listeners (trip/close)
    // TODO tests for shouldTriggerAsFailure function override
});
